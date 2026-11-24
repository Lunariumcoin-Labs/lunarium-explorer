// Indexer: reads the XLN blockchain from the node, block by block, and builds the explorer database.
// It also detects orphaned blocks (reorgs) and rolls back to the common point with the network.
import { getMeta, setMeta, inTransaction } from "./db.mjs";
import { RpcError } from "./rpc.mjs";
import { canonicalAddress } from "./address.mjs";

const SATS = 100000000;
export const toSats = (v) => Math.round(Number(v) * SATS);

// The "owner" address of an output, always in "L" form. Cold staking lists [staker, owner]: the balance is the owner's.
export function outputAddress(spk) {
  const list = spk?.addresses;
  if (!Array.isArray(list) || !list.length) return null;
  if (/coldstake/.test(spk.type || "")) return canonicalAddress(list[list.length - 1]);
  return list.length === 1 ? canonicalAddress(list[0]) : null;
}

export function txKind(tx) {
  if (tx.vin?.[0]?.coinbase !== undefined) return "coinbase";
  const v0 = tx.vout?.[0];
  if (tx.vout?.length >= 2 && v0 && Number(v0.value) === 0 && (!v0.scriptPubKey?.hex || v0.scriptPubKey.type === "nonstandard")) return "coinstake";
  return "normal";
}

function opReturnText(spk) {
  if (spk?.type !== "nulldata") return null;
  const m = /OP_RETURN\s+([0-9a-f]+)/i.exec(spk.asm || "");
  if (!m) return "";
  const buf = Buffer.from(m[1], "hex");
  const text = buf.toString("utf8");
  return /^[\x20-\x7e -￿\s]*$/.test(text) ? text.slice(0, 200) : m[1].slice(0, 400);
}

export function createIndexer({ db, rpc, batchBlocks = 40, log = console.log }) {
  const st = {
    blockByHeight: db.prepare("SELECT hash FROM blocks WHERE height = ?"),
    maxHeight: db.prepare("SELECT MAX(height) AS h FROM blocks"),
    insBlock: db.prepare(`INSERT INTO blocks (height, hash, prev_hash, time, size, tx_count, kind, minted, fees, out_total, staker, mn_payee, mn_amount, difficulty, version, bits, nonce, merkleroot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    insTx: db.prepare(`INSERT INTO txs (txid, height, idx, time, kind, size, n_in, n_out, value_in, value_out, fee, op_return)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    txIdByTxid: db.prepare("SELECT id FROM txs WHERE txid = ?"),
    getOut: db.prepare("SELECT addr_id, value, spent_tx FROM outputs WHERE tx_id = ? AND n = ?"),
    spendOut: db.prepare("UPDATE outputs SET spent_tx = ?, spent_n = ?, spent_height = ? WHERE tx_id = ? AND n = ?"),
    insOut: db.prepare("INSERT INTO outputs (tx_id, n, addr_id, value, type) VALUES (?, ?, ?, ?, ?)"),
    addrId: db.prepare("SELECT id FROM addresses WHERE address = ?"),
    addrIns: db.prepare("INSERT INTO addresses (address, first_height, last_height) VALUES (?, ?, ?)"),
    addrApply: db.prepare(`UPDATE addresses SET balance = balance + ? - ?, received = received + ?, sent = sent + ?, tx_count = tx_count + 1, last_height = ?
      WHERE id = ? RETURNING balance`),
    insAddrTx: db.prepare("INSERT INTO address_txs (addr_id, height, tx_id, received, sent, balance) VALUES (?, ?, ?, ?, ?, ?)"),
  };

  const addrCache = new Map();
  function addressId(address, height) {
    let id = addrCache.get(address);
    if (id !== undefined) return id;
    const r = st.addrId.get(address);
    if (r) id = r.id;
    else id = Number(st.addrIns.run(address, height, height).lastInsertRowid);
    if (addrCache.size > 400000) addrCache.clear();
    addrCache.set(address, id);
    return id;
  }

  const txIdCache = new Map(); // recent txids → id (inputs almost always spend recent outputs)
  function txIdOf(txid) {
    const c = txIdCache.get(txid);
    if (c !== undefined) return c;
    const r = st.txIdByTxid.get(txid);
    return r ? r.id : null;
  }

  function storeBlock(block, txs) {
    const h = block.height;
    let minted = 0, fees = 0, outTotal = 0, staker = null, mnPayee = null, mnAmount = null;
    const kind = txs.some((t) => txKind(t) === "coinstake") ? "pos" : "pow";

    txs.forEach((tx, idx) => {
      const k = txKind(tx);
      // inputs: look up the spent output, mark it spent and add it up per address
      let valueIn = 0;
      const perAddr = new Map(); // addr_id → { r, s }
      const touch = (id) => { let o = perAddr.get(id); if (!o) { o = { r: 0, s: 0 }; perAddr.set(id, o); } return o; };
      const outsInfo = [];
      let valueOut = 0;
      for (const vout of tx.vout || []) {
        const value = toSats(vout.value);
        valueOut += value;
        const addr = outputAddress(vout.scriptPubKey);
        outsInfo.push({ n: vout.n, value, addr, type: vout.scriptPubKey?.type || null });
      }
      const opRet = (tx.vout || []).map((v) => opReturnText(v.scriptPubKey)).find((x) => x !== null) ?? null;
      const size = tx.hex ? tx.hex.length / 2 : null;

      // inputs: each one spends an already indexed output
      const spends = [];
      if (k !== "coinbase") {
        (tx.vin || []).forEach((vin, i) => {
          const prevId = txIdOf(vin.txid);
          if (prevId === null) throw new Error(`entrada aponta para transação desconhecida ${vin.txid} (bloco ${h})`);
          const prev = st.getOut.get(prevId, vin.vout);
          if (!prev) throw new Error(`saída ${vin.txid}:${vin.vout} não encontrada (bloco ${h})`);
          if (prev.spent_tx !== null) throw new Error(`saída ${vin.txid}:${vin.vout} já gasta (bloco ${h})`);
          spends.push([i, prevId, vin.vout]);
          valueIn += prev.value;
          if (prev.addr_id !== null) touch(prev.addr_id).s += prev.value;
        });
      }
      const fee = k === "normal" ? valueIn - valueOut : 0;

      const res = st.insTx.run(tx.txid, h, idx, block.time, k, size, (tx.vin || []).length, (tx.vout || []).length, valueIn, valueOut, fee, opRet);
      const txId = Number(res.lastInsertRowid);
      txIdCache.set(tx.txid, txId);
      for (const [i, prevId, n] of spends) st.spendOut.run(txId, i, h, prevId, n);

      for (const o of outsInfo) {
        let addrId = null;
        if (o.addr) { addrId = addressId(o.addr, h); touch(addrId).r += o.value; }
        st.insOut.run(txId, o.n, addrId, o.value, o.type);
      }

      outTotal += valueOut;
      if (k === "normal") fees += fee;
      else minted += valueOut - valueIn;

      // who produced the block and which masternode was paid
      if (k === "coinstake") {
        staker = outsInfo[1]?.addr ?? null;
        const last = outsInfo[outsInfo.length - 1];
        if (outsInfo.length > 2 && last.addr && last.addr !== staker) { mnPayee = last.addr; mnAmount = last.value; }
      } else if (k === "coinbase" && kind === "pow") {
        const paid = outsInfo.filter((o) => o.value > 0 && o.addr);
        staker = paid[0]?.addr ?? null;
        if (paid.length > 1) { mnPayee = paid[paid.length - 1].addr; mnAmount = paid[paid.length - 1].value; }
      }

      for (const [addrId, { r, s }] of perAddr) {
        const { balance } = st.addrApply.get(r, s, r, s, h, addrId);
        st.insAddrTx.run(addrId, h, txId, r, s, balance);
      }
    });

    st.insBlock.run(h, block.hash, block.previousblockhash || null, block.time, block.size, txs.length, kind, minted, fees, outTotal,
      staker, mnPayee, mnAmount, block.difficulty, block.version, block.bits, block.nonce, block.merkleroot);
  }

  // Rolls back every block above `height` (reorg).
  function rollbackTo(height) {
    prefetch = null;
    inTransaction(db, () => {
      const rows = db.prepare("SELECT addr_id, SUM(received) AS r, SUM(sent) AS s, COUNT(*) AS c FROM address_txs WHERE height > ? GROUP BY addr_id").all(height);
      const upd = db.prepare("UPDATE addresses SET balance = balance - ? + ?, received = received - ?, sent = sent - ?, tx_count = tx_count - ? WHERE id = ?");
      for (const r of rows) upd.run(r.r, r.s, r.r, r.s, r.c, r.addr_id);
      db.prepare("DELETE FROM address_txs WHERE height > ?").run(height);
      const last = db.prepare("UPDATE addresses SET last_height = (SELECT MAX(height) FROM address_txs WHERE addr_id = addresses.id) WHERE id = ?");
      for (const r of rows) last.run(r.addr_id);
      db.prepare("DELETE FROM addresses WHERE tx_count = 0 AND first_height > ?").run(height);
      db.prepare("UPDATE outputs SET spent_tx = NULL, spent_n = NULL, spent_height = NULL WHERE spent_height > ?").run(height);
      db.prepare("DELETE FROM outputs WHERE tx_id IN (SELECT id FROM txs WHERE height > ?)").run(height);
      db.prepare("DELETE FROM txs WHERE height > ?").run(height);
      db.prepare("DELETE FROM blocks WHERE height > ?").run(height);
      setMeta(db, "tip", height);
    });
    addrCache.clear();
    txIdCache.clear();
  }

  async function findForkPoint(from) {
    for (let h = from; h >= 0; h--) {
      const mine = st.blockByHeight.get(h);
      if (!mine) continue;
      const theirs = await rpc.call("getblockhash", h);
      if (theirs === mine.hash) return h;
    }
    return -1;
  }

  async function fetchRange(from, to) {
    const heights = [];
    for (let h = from; h <= to; h++) heights.push(h);
    const hashes = await rpc.batch(heights.map((h) => ["getblockhash", h]));
    for (const x of hashes) if (x instanceof Error) throw x;
    const blocks = await rpc.batch(hashes.map((hash) => ["getblock", hash]));
    for (const x of blocks) if (x instanceof Error) throw x;
    const txids = [];
    for (const b of blocks) if (b.height > 0) txids.push(...b.tx);
    const txMap = new Map();
    for (let i = 0; i < txids.length; i += 400) {
      const chunk = txids.slice(i, i + 400);
      const res = await rpc.batch(chunk.map((id) => ["getrawtransaction", id, 1]));
      res.forEach((r, j) => {
        if (r instanceof Error) throw new RpcError(`getrawtransaction ${chunk[j]}: ${r.message}`, r.code);
        txMap.set(chunk[j], r);
      });
    }
    return blocks.map((b) => ({ block: b, txs: b.height > 0 ? b.tx.map((id) => txMap.get(id)) : [] }));
  }

  let stopping = false;
  let lastLog = 0;
  let prefetch = null;

  // One step: processes up to `batchBlocks` blocks. Returns how many were processed (0 = already at the tip).
  async function step() {
    const nodeHeight = await rpc.call("getblockcount");
    const mine = st.maxHeight.get().h;
    const next = mine === null ? 0 : mine + 1;
    if (next > nodeHeight) {
      // at the tip: check that our last block is still the network's
      if (mine !== null) {
        const theirs = await rpc.call("getblockhash", mine);
        if (theirs !== st.blockByHeight.get(mine).hash) {
          const fork = await findForkPoint(mine - 1);
          log(`reorg detectado no bloco ${mine}: voltando para ${fork}`);
          rollbackTo(fork);
          return 1;
        }
      }
      return 0;
    }
    const to = Math.min(nodeHeight, next + batchBlocks - 1);
    let items;
    if (prefetch && prefetch.from === next && prefetch.to === to) {
      items = await prefetch.promise.catch(() => null);
    }
    prefetch = null;
    if (!items) items = await fetchRange(next, to);
    // while this batch is written, the node already prepares the next one
    if (to < nodeHeight) {
      const nFrom = to + 1, nTo = Math.min(nodeHeight, to + batchBlocks);
      const promise = fetchRange(nFrom, nTo);
      promise.catch(() => {});
      prefetch = { from: nFrom, to: nTo, promise };
    }
    // the first block must connect to the last one we have
    if (next > 0 && items[0].block.previousblockhash !== st.blockByHeight.get(next - 1)?.hash) {
      const fork = await findForkPoint(next - 1);
      log(`reorg detectado antes do bloco ${next}: voltando para ${fork}`);
      rollbackTo(fork);
      return 1;
    }
    inTransaction(db, () => {
      for (let i = 0; i < items.length; i++) {
        const { block, txs } = items[i];
        if (i > 0 && block.previousblockhash !== items[i - 1].block.hash) throw new Error(`lote inconsistente no bloco ${block.height} (a rede mudou durante a leitura)`);
        storeBlock(block, txs);
      }
      setMeta(db, "tip", to);
      setMeta(db, "tip_time", items[items.length - 1].block.time);
    });
    if (txIdCache.size > 200000) txIdCache.clear();
    const now = Date.now();
    if (now - lastLog > 15000 || to === nodeHeight) {
      lastLog = now;
      log(`indexado até o bloco ${to} de ${nodeHeight}`);
    }
    return items.length;
  }

  async function run({ idleMs = 4000, onTip } = {}) {
    while (!stopping) {
      try {
        const n = await step();
        if (n === 0) {
          if (onTip) await onTip();
          await new Promise((r) => setTimeout(r, idleMs));
        }
      } catch (e) {
        log(`indexador: ${e.message} — tentando de novo em 15 s`);
        prefetch = null;
        txIdCache.clear();
        addrCache.clear();
        await new Promise((r) => setTimeout(r, 15000));
      }
    }
  }

  return { step, run, rollbackTo, stop: () => { stopping = true; }, tip: () => st.maxHeight.get().h, getMeta: (k) => getMeta(db, k) };
}
