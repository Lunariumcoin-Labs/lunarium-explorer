// API pública nova do explorador (/api/v1/...). Valores em XLN como texto com 8 casas, para não perder
// precisão (a oferta total passa do limite exato de um número de ponto flutuante).
import { expectedSupply, MINT_HEIGHT, MINT_AMOUNT } from "./emission.mjs";
import { getMeta, setMeta } from "./db.mjs";
import { canonicalAddress, legacyAddress, isValidAddress } from "./address.mjs";

const SATS = 100000000n;

export function xln(sats) {
  if (sats === null || sats === undefined) return null;
  const b = BigInt(sats);
  const neg = b < 0n;
  const a = neg ? -b : b;
  return `${neg ? "-" : ""}${a / SATS}.${String(a % SATS).padStart(8, "0")}`;
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Limite de moedas novas por bloco = GetBlockValue(altura) da regra do core (masternode.cpp), em satoshis.
const LIMIT_SQL = `(CASE
  WHEN height = ${MINT_HEIGHT} THEN ${MINT_AMOUNT * 1e8} + 1000000000
  WHEN height > 6928901 THEN 100000000
  WHEN height > 4826501 THEN 200000000
  WHEN height > 2724101 THEN 500000000
  WHEN height > 621701 THEN 1000000000
  WHEN height > 14400 THEN 1200000000
  WHEN height > 1 THEN 100000000
  WHEN height > 0 THEN 5100000000000000
  ELSE 5000000000 END + CASE WHEN kind = 'pow' THEN fees ELSE 0 END)`;

export function createApi({ db, rpc, live, aliases }) {
  const q = (sql) => db.prepare(sql);
  const big = (sql) => { const s = db.prepare(sql); s.setReadBigInts(true); return s; };

  const st = {
    tip: q("SELECT height, hash, time FROM blocks ORDER BY height DESC LIMIT 1"),
    blockByHeight: q("SELECT height, hash, prev_hash, time, size, tx_count, kind, minted, fees, CAST(out_total AS TEXT) AS out_total, staker, mn_payee, mn_amount, difficulty, version, bits, nonce, merkleroot FROM blocks WHERE height = ?"),
    blockByHash: q("SELECT height, hash, prev_hash, time, size, tx_count, kind, minted, fees, CAST(out_total AS TEXT) AS out_total, staker, mn_payee, mn_amount, difficulty, version, bits, nonce, merkleroot FROM blocks WHERE hash = ?"),
    blocksBefore: q("SELECT height, hash, time, size, tx_count, kind, minted, fees, staker, mn_payee, mn_amount FROM blocks WHERE height <= ? ORDER BY height DESC LIMIT ?"),
    blockTxs: q("SELECT id, txid, idx, kind, n_in, n_out, value_in, value_out, fee FROM txs WHERE height = ? ORDER BY idx"),
    txByTxid: q("SELECT * FROM txs WHERE txid = ?"),
    txIdByTxid: q("SELECT id FROM txs WHERE txid = ?"),
    inputsOf: q(`SELECT o.spent_n AS i, o.n AS vout, o.value, o.type, a.address, t.txid AS prev_txid
      FROM outputs o JOIN txs t ON t.id = o.tx_id LEFT JOIN addresses a ON a.id = o.addr_id
      WHERE o.spent_tx = ? ORDER BY o.spent_n`),
    outputsOf: q(`SELECT o.n, o.value, o.type, a.address, st.txid AS spent_txid, o.spent_height
      FROM outputs o LEFT JOIN addresses a ON a.id = o.addr_id LEFT JOIN txs st ON st.id = o.spent_tx
      WHERE o.tx_id = ? ORDER BY o.n`),
    outputOne: q("SELECT o.value, o.type, a.address FROM outputs o LEFT JOIN addresses a ON a.id = o.addr_id WHERE o.tx_id = ? AND o.n = ?"),
    // recebido/enviado acumulam o stake que volta a cada bloco e passam do limite exato de um Number: vêm como texto
    addr: q("SELECT id, address, balance, CAST(received AS TEXT) AS received, CAST(sent AS TEXT) AS sent, tx_count, first_height, last_height FROM addresses WHERE address = ?"),
    addrRank: q("SELECT COUNT(*) + 1 AS r FROM addresses WHERE balance > ?"),
    addrTxs: q(`SELECT at.height, at.received, at.sent, at.balance, t.txid, t.time, t.kind
      FROM address_txs at JOIN txs t ON t.id = at.tx_id WHERE at.addr_id = ? ORDER BY at.height DESC, at.tx_id DESC LIMIT ? OFFSET ?`),
    addrUtxos: q(`SELECT t.txid, o.n, o.value, t.height FROM outputs o JOIN txs t ON t.id = o.tx_id
      WHERE o.addr_id = ? AND o.spent_tx IS NULL ORDER BY t.height DESC LIMIT ?`),
    mnRewards: big("SELECT COUNT(*) AS c, COALESCE(SUM(mn_amount), 0) AS s, MAX(height) AS last FROM blocks WHERE mn_payee = ?"),
    stakeRewards: big("SELECT COUNT(*) AS c, COALESCE(SUM(minted - COALESCE(mn_amount, 0)), 0) AS s, MAX(height) AS last FROM blocks WHERE staker = ?"),
    rich: q("SELECT address, balance, CAST(received AS TEXT) AS received, CAST(sent AS TEXT) AS sent, tx_count, last_height FROM addresses ORDER BY balance DESC LIMIT ?"),
    utxoSum: big("SELECT COALESCE(SUM(balance), 0) AS s FROM addresses WHERE balance > 0"),
    noAddrUtxo: big("SELECT COALESCE(SUM(value), 0) AS s FROM outputs WHERE spent_tx IS NULL AND addr_id IS NULL"),
    mintedSum: big("SELECT COALESCE(SUM(minted), 0) AS m, COALESCE(SUM(CASE WHEN kind = 'pos' THEN fees ELSE 0 END), 0) AS burned FROM blocks"),
    movement: q(`SELECT t.txid, t.height, t.time, t.value_out, t.n_out FROM txs t
      WHERE t.kind = 'normal' AND t.value_out >= ? AND t.height <= ? ORDER BY t.height DESC, t.idx DESC LIMIT ?`),
    recentTxs: q(`SELECT txid, height, time, kind, CASE WHEN kind = 'normal' THEN value_out ELSE value_out - value_in END AS value_out, n_out
      FROM txs WHERE height <= ? AND NOT (kind = 'coinbase' AND value_out = 0) ORDER BY height DESC, idx DESC LIMIT ?`),
    blockStats: q("SELECT COUNT(*) AS n, MIN(time) AS t0, MAX(time) AS t1, SUM(tx_count) AS txs FROM blocks WHERE height > ?"),
    txs24h: big("SELECT COUNT(*) AS c, COALESCE(SUM(value_out), 0) AS v FROM txs WHERE height >= (SELECT COALESCE(MIN(height), 1000000000) FROM blocks WHERE time >= ?) AND kind = 'normal'"),
    addrCount: q("SELECT COUNT(*) AS c FROM addresses WHERE balance > 0"),
  };

  function tipInfo() {
    const t = st.tip.get();
    return t || { height: -1, hash: null, time: null };
  }

  let lastNodeCheck = null;

  // ---------- auditoria da emissão (incremental: só confere blocos novos) ----------
  function audit() {
    // se a regra mudar (ex.: altura do mint), a conferência recomeça do bloco 0 com a regra nova
    const rule = `v2:mint@${MINT_HEIGHT}`;
    if (getMeta(db, "audit_rule") !== rule) {
      setMeta(db, "audit_violations", "[]");
      setMeta(db, "audit_height", "-1");
      setMeta(db, "audit_rule", rule);
    }
    const checked = Number(getMeta(db, "audit_height", "-1"));
    const tip = tipInfo().height;
    if (tip > checked) {
      const rows = q(`SELECT height, minted, ${LIMIT_SQL} AS lim FROM blocks WHERE height > ? AND height <= ? AND minted > ${LIMIT_SQL} LIMIT 50`).all(checked, tip);
      const prev = JSON.parse(getMeta(db, "audit_violations", "[]"));
      const all = prev.concat(rows.map((r) => ({ height: r.height, minted: xln(r.minted), limit: xln(r.lim) }))).slice(0, 200);
      setMeta(db, "audit_violations", JSON.stringify(all));
      setMeta(db, "audit_height", tip);
    }
    const violations = JSON.parse(getMeta(db, "audit_violations", "[]"));
    return { checkedUpTo: tip, violations: violations.length, list: violations.slice(0, 20) };
  }

  // Somas da cadeia mantidas de forma incremental (só os blocos novos entram na conta; num reorg recalcula tudo).
  // Oferta = moedas criadas − taxas pagas: é exatamente a soma das saídas não gastas, sem varrer milhões de saídas.
  const sumRange = big(`SELECT COALESCE(SUM(minted), 0) AS m, COALESCE(SUM(fees), 0) AS f,
      COALESCE(SUM(CASE WHEN kind = 'pos' THEN fees ELSE 0 END), 0) AS burned FROM blocks WHERE height > ? AND height <= ?`);
  const hashAt = q("SELECT hash FROM blocks WHERE height = ?");
  let agg = null;
  function chainSums() {
    const t = tipInfo();
    if (agg && agg.height === t.height && agg.hash === t.hash) return agg;
    let base = agg;
    if (!base || t.height < base.height || hashAt.get(base.height)?.hash !== base.hash) base = { height: -1, m: 0n, f: 0n, burned: 0n };
    const r = sumRange.get(base.height, t.height);
    agg = { height: t.height, hash: t.hash, m: base.m + r.m, f: base.f + r.f, burned: base.burned + r.burned };
    return agg;
  }

  function supply() {
    const tip = tipInfo().height;
    const sums = chainSums();
    const held = sums.m - sums.f;
    const m = sums.m, burned = sums.burned;
    const expected = tip >= 0 ? BigInt(Math.round(expectedSupply(tip) * 1e8)) : 0n;
    // conferência com o próprio node: só vale com as duas contas na MESMA altura
    const raw = live.state.txoutset;
    if (raw && raw.height === tip && lastNodeCheck?.height !== tip) {
      const nodeSats = BigInt(Math.round(Number(raw.total_amount) * 1e8));
      lastNodeCheck = { height: tip, total: xln(nodeSats), ours: xln(held), diff: xln(nodeSats - held), at: live.state.updated.txoutset };
    }
    const txo = lastNodeCheck;
    return {
      height: tip,
      supply: xln(held),
      minted: xln(m),
      expectedByRule: xln(expected),
      feesDestroyed: xln(burned),
      nodeCheck: txo,
      mint: { height: MINT_HEIGHT, amount: xln(BigInt(MINT_AMOUNT) * SATS) },
      audit: audit(),
    };
  }

  // O resumo da rede muda a cada bloco (ou a cada poucos segundos nos dados ao vivo): guarda por 3 s.
  let statsCache = { at: 0, hash: null, v: null };
  function stats() {
    const now = Date.now();
    const th = tipInfo().hash;
    if (statsCache.v && statsCache.hash === th && now - statsCache.at < 3000) return statsCache.v;
    statsCache = { at: now, hash: th, v: computeStats() };
    return statsCache.v;
  }
  function computeStats() {
    const tip = tipInfo();
    const recent = st.blockStats.get(Math.max(0, tip.height - 100));
    const day = st.txs24h.get(Math.floor(Date.now() / 1000) - 86400);
    const mn = live.state.mnCount;
    const sup = supply();
    const price = live.state.price;
    return {
      height: tip.height,
      hash: tip.hash,
      time: tip.time,
      synced: tip.time ? Date.now() / 1000 - tip.time < 900 : false,
      avgBlockTime: recent.n > 1 ? (recent.t1 - recent.t0) / (recent.n - 1) : null,
      supply: sup.supply,
      expectedSupply: sup.expectedByRule,
      auditViolations: sup.audit.violations,
      difficulty: live.state.network?.difficulty ?? null,
      hashrate: live.state.network?.hashrate ?? null,
      connections: live.state.network?.connections ?? null,
      masternodes: mn ? { total: mn.total, enabled: mn.enabled ?? mn.stable, ipv4: mn.ipv4, ipv6: mn.ipv6, onion: mn.onion } : null,
      mempool: live.state.mempool.length,
      txs24h: Number(day.c),
      volume24h: xln(day.v),
      addressesWithBalance: st.addrCount.get().c,
      price: price ? { usd: price.usd, change24h: price.change24h, source: price.source, marketCapUsd: Number(sup.supply) * price.usd } : null,
    };
  }

  function blockSummary(b) {
    return {
      height: b.height, hash: b.hash, time: b.time, size: b.size, txCount: b.tx_count, kind: b.kind,
      minted: xln(b.minted), fees: xln(b.fees), staker: b.staker, masternode: b.mn_payee, masternodeReward: xln(b.mn_amount),
    };
  }

  function blocks({ before, limit = 20 }) {
    const top = before === undefined || before === null || before === "" ? tipInfo().height : Number(before);
    const n = Math.min(100, Math.max(1, Number(limit) || 20));
    return st.blocksBefore.all(top, n).map(blockSummary);
  }

  function block(id) {
    const b = /^\d+$/.test(id) ? st.blockByHeight.get(Number(id)) : st.blockByHash.get(String(id).toLowerCase());
    if (!b) throw new HttpError(404, "bloco não encontrado");
    const tip = tipInfo().height;
    const txs = st.blockTxs.all(b.height).map((t) => ({
      txid: t.txid, kind: t.kind, inputs: t.n_in, outputs: t.n_out, valueIn: xln(t.value_in), valueOut: xln(t.value_out), fee: xln(t.fee),
    }));
    const next = st.blockByHeight.get(b.height + 1);
    return {
      ...blockSummary(b), confirmations: tip - b.height + 1, difficulty: b.difficulty, version: b.version, bits: b.bits, nonce: b.nonce,
      merkleroot: b.merkleroot, previous: b.prev_hash, next: next?.hash || null, outTotal: xln(b.out_total), txs,
    };
  }

  async function tx(txid) {
    txid = String(txid).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(txid)) throw new HttpError(400, "txid inválido");
    const t = st.txByTxid.get(txid);
    const tip = tipInfo().height;
    if (t) {
      const blk = st.blockByHeight.get(t.height);
      return {
        txid: t.txid, confirmed: true, height: t.height, blockHash: blk?.hash, time: t.time, confirmations: tip - t.height + 1,
        kind: t.kind, size: t.size, fee: xln(t.fee), valueIn: xln(t.value_in), valueOut: xln(t.value_out), opReturn: t.op_return,
        minted: t.kind === "normal" ? null : xln(t.value_out - t.value_in),
        inputs: t.kind === "coinbase" ? [] : st.inputsOf.all(t.id).map((i) => ({ txid: i.prev_txid, vout: i.vout, address: i.address, value: xln(i.value), type: i.type })),
        outputs: st.outputsOf.all(t.id).map((o) => ({ n: o.n, address: o.address, value: xln(o.value), type: o.type, spentBy: o.spent_txid || null, spentHeight: o.spent_height })),
      };
    }
    // ainda na mempool?
    let raw;
    try { raw = await rpc.call("getrawtransaction", txid, 1); } catch { raw = null; }
    if (!raw) throw new HttpError(404, "transação não encontrada");
    let valueIn = 0n, valueOut = 0n, known = true;
    const inputs = (raw.vin || []).map((v) => {
      const pid = v.txid ? st.txIdByTxid.get(v.txid)?.id : null;
      const o = pid ? st.outputOne.get(pid, v.vout) : null;
      if (o) valueIn += BigInt(o.value); else known = false;
      return { txid: v.txid, vout: v.vout, address: o?.address ?? null, value: o ? xln(o.value) : null, type: o?.type ?? null };
    });
    const outputs = (raw.vout || []).map((o) => {
      const s = BigInt(Math.round(Number(o.value) * 1e8));
      valueOut += s;
      const a = o.scriptPubKey?.addresses;
      return { n: o.n, address: a ? canonicalAddress(a[a.length - 1]) : null, value: xln(s), type: o.scriptPubKey?.type || null, spentBy: null };
    });
    return {
      txid, confirmed: false, height: null, time: raw.time || null, confirmations: 0, kind: "normal", size: raw.size || (raw.hex ? raw.hex.length / 2 : null),
      fee: known ? xln(valueIn - valueOut) : null, valueIn: known ? xln(valueIn) : null, valueOut: xln(valueOut), inputs, outputs,
    };
  }

  function address(a) {
    a = canonicalAddress(a);
    const r = st.addr.get(a);
    if (!r) throw new HttpError(404, "endereço sem movimentação");
    const mn = st.mnRewards.get(a);
    const stake = st.stakeRewards.get(a);
    const nodes = live.state.masternodes.filter((m) => canonicalAddress(m.addr) === a).map((m) => ({
      txhash: m.txhash, outidx: m.outidx, status: m.status, network: m.network, version: m.version, activetime: m.activetime, lastpaid: m.lastpaid,
    }));
    return {
      address: r.address, legacy: legacyAddress(r.address), alias: aliases?.nameOf(r.address) || null, balance: xln(r.balance), received: xln(r.received), sent: xln(r.sent), txCount: r.tx_count,
      firstHeight: r.first_height, lastHeight: r.last_height, rank: r.balance > 0 ? st.addrRank.get(r.balance).r : null,
      rewards: {
        masternode: { count: Number(mn.c), total: xln(mn.s), last: mn.last === null ? null : Number(mn.last) },
        stake: { count: Number(stake.c), total: xln(stake.s), last: stake.last === null ? null : Number(stake.last) },
      },
      masternodes: nodes,
    };
  }

  function addressTxs(a, { offset = 0, limit = 25 }) {
    const r = st.addr.get(canonicalAddress(a));
    if (!r) throw new HttpError(404, "endereço sem movimentação");
    const n = Math.min(100, Math.max(1, Number(limit) || 25));
    const rows = st.addrTxs.all(r.id, n, Math.max(0, Number(offset) || 0));
    return {
      total: r.tx_count,
      txs: rows.map((x) => ({ txid: x.txid, height: x.height, time: x.time, kind: x.kind, received: xln(x.received), sent: xln(x.sent), delta: xln(x.received - x.sent), balance: xln(x.balance) })),
    };
  }

  function addressUtxos(a) {
    const r = st.addr.get(canonicalAddress(a));
    if (!r) throw new HttpError(404, "endereço sem movimentação");
    const tip = tipInfo().height;
    return st.addrUtxos.all(r.id, 500).map((u) => ({ txid: u.txid, vout: u.n, value: xln(u.value), height: u.height, confirmations: tip - u.height + 1 }));
  }

  let richCache = { at: 0, v: null };
  function richlist() {
    if (richCache.v && Date.now() - richCache.at < 60000) return richCache.v;
    const top = st.rich.all(100);
    const total = BigInt(supply().supply.replace(".", ""));
    const sumRange = (a, b) => top.slice(a, b).reduce((s, r) => s + BigInt(r.balance), 0n);
    const pct = (v) => (total > 0n ? Number((v * 1000000n) / total) / 10000 : 0);
    const ranges = [[0, 25], [25, 50], [50, 75], [75, 100]].map(([a, b]) => ({ from: a + 1, to: b, total: xln(sumRange(a, b)), percent: pct(sumRange(a, b)) }));
    const top100 = sumRange(0, 100);
    ranges.push({ from: 101, to: null, total: xln(total - top100), percent: pct(total - top100) });
    const mnAddrs = new Set(live.state.masternodes.map((m) => canonicalAddress(m.addr)));
    richCache = {
      at: Date.now(),
      v: {
        supply: xln(total),
        distribution: ranges,
        top: top.map((r, i) => ({ rank: i + 1, address: r.address, balance: xln(r.balance), percent: pct(BigInt(r.balance)), received: xln(r.received), sent: xln(r.sent), txCount: r.tx_count, lastHeight: r.last_height, masternode: mnAddrs.has(r.address) })),
      },
    };
    return richCache.v;
  }

  function movement({ min = 1000, limit = 50, before }) {
    const top = before ? Number(before) : tipInfo().height;
    const minSats = Math.max(0, Math.round(Number(min) * 1e8) || 0);
    return st.movement.all(minSats, top, Math.min(200, Math.max(1, Number(limit) || 50))).map((t) => ({ txid: t.txid, height: t.height, time: t.time, value: xln(t.value_out), recipients: t.n_out }));
  }

  function recentTxs(limit = 15) {
    return st.recentTxs.all(tipInfo().height, Math.min(100, Number(limit) || 15)).map((t) => ({ txid: t.txid, height: t.height, time: t.time, kind: t.kind, value: xln(t.value_out), outputs: t.n_out }));
  }

  let chartCache = { at: 0, key: "", v: null };
  function charts(days = 30) {
    const d = Math.min(365, Math.max(7, Number(days) || 30));
    const key = String(d);
    if (chartCache.v && chartCache.key === key && Date.now() - chartCache.at < 10 * 60000) return chartCache.v;
    const since = Math.floor(Date.now() / 1000 / 86400 - d + 1) * 86400;
    const rows = q(`SELECT time / 86400 AS day, COUNT(*) AS blocks, SUM(tx_count) AS txs, AVG(difficulty) AS difficulty,
        SUM(CASE WHEN kind = 'pos' THEN 1 ELSE 0 END) AS pos FROM blocks WHERE time >= ? GROUP BY day ORDER BY day`).all(since);
    const vol = big(`SELECT time / 86400 AS day, COUNT(*) AS n, SUM(value_out) AS v FROM txs
        WHERE height >= (SELECT COALESCE(MIN(height), 0) FROM blocks WHERE time >= ?) AND kind = 'normal' GROUP BY day`).all(since);
    const vm = new Map(vol.map((r) => [Number(r.day), r]));
    chartCache = {
      at: Date.now(), key,
      v: rows.map((r) => ({
        day: new Date(r.day * 86400000).toISOString().slice(0, 10), blocks: r.blocks, txs: r.txs, difficulty: r.difficulty,
        transfers: Number(vm.get(r.day)?.n || 0), volume: xln(vm.get(r.day)?.v || 0), avgBlockTime: r.blocks ? 86400 / r.blocks : null,
      })),
    };
    return chartCache.v;
  }

  async function search(qs) {
    const s = String(qs || "").trim();
    if (!s) throw new HttpError(400, "busca vazia");
    if (/^\d{1,9}$/.test(s)) {
      if (st.blockByHeight.get(Number(s))) return { type: "block", id: s };
    }
    if (/^[0-9a-fA-F]{64}$/.test(s)) {
      const h = s.toLowerCase();
      if (st.blockByHash.get(h)) return { type: "block", id: h };
      if (st.txByTxid.get(h)) return { type: "tx", id: h };
      if (live.state.mempool.includes(h)) return { type: "tx", id: h };
    }
    if (isValidAddress(s)) {
      const a = canonicalAddress(s);
      return { type: "address", id: a, empty: !st.addr.get(a) };
    }
    const byName = aliases?.search(s);
    if (byName) return { type: "address", id: byName };
    throw new HttpError(404, "nada encontrado para essa busca");
  }

  function masternodes() {
    const mnAddrs = live.state.masternodes;
    return {
      count: live.state.mnCount,
      updated: live.state.updated.masternodes || null,
      list: mnAddrs.map((m) => ({
        rank: m.rank, network: m.network, txhash: m.txhash, outidx: m.outidx, status: m.status, address: canonicalAddress(m.addr),
        version: m.version, lastseen: m.lastseen, activetime: m.activetime, lastpaid: m.lastpaid,
      })),
    };
  }

  function peers() {
    return { updated: live.state.updated.peers || null, list: live.state.peers };
  }

  async function mempool() {
    const ids = live.state.mempool.slice(0, 100);
    const res = ids.length ? await rpc.batch(ids.map((id) => ["getrawtransaction", id, 1])) : [];
    return res.filter((r) => !(r instanceof Error)).map((r) => ({
      txid: r.txid, size: r.size || (r.hex ? r.hex.length / 2 : null), outputs: (r.vout || []).length,
      value: xln((r.vout || []).reduce((s, o) => s + BigInt(Math.round(Number(o.value) * 1e8)), 0n)),
    }));
  }

  return { stats, supply, blocks, block, tx, address, addressTxs, addressUtxos, richlist, movement, recentTxs, charts, search, masternodes, peers, mempool, tipInfo, audit };
}
