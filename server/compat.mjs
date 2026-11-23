// Compatibilidade com a API do eIquidus (o explorador antigo do explorerxln.com).
// O app Android, o painel de recompensas (xln-swap-xlnft) e o GaláxiaLunarium leem estas rotas:
// formato, nomes de campos e até as esquisitices do eIquidus são reproduzidos de propósito.
//  - /ext/gettx: valores em satoshis, como texto; o stake aparece só pelo lucro (entrada do staker descontada).
//  - /ext/getaddresstxs: "sent" é o que o endereço RECEBEU e "received" o que ele GASTOU (assim no eIquidus).
import { HttpError } from "./api.mjs";
import { canonicalAddress } from "./address.mjs";

const SATS = 1e8;
const asXln = (sats) => String(Number(sats) / SATS);

export function createCompat({ db, rpc, live, api, aliases }) {
  const q = (sql) => db.prepare(sql);
  const st = {
    tx: q("SELECT * FROM txs WHERE txid = ?"),
    block: q("SELECT hash, time FROM blocks WHERE height = ?"),
    inputs: q(`SELECT o.value, a.address FROM outputs o LEFT JOIN addresses a ON a.id = o.addr_id WHERE o.spent_tx = ? ORDER BY o.spent_n`),
    outputs: q(`SELECT o.n, o.value, a.address FROM outputs o LEFT JOIN addresses a ON a.id = o.addr_id WHERE o.tx_id = ? ORDER BY o.n`),
    addr: q("SELECT id, address, balance, tx_count FROM addresses WHERE address = ?"),
    addrRows: q(`SELECT at.height, at.received, at.sent, at.balance, t.id, t.txid, t.time, t.kind
      FROM address_txs at JOIN txs t ON t.id = at.tx_id WHERE at.addr_id = ? ORDER BY at.height DESC, at.tx_id DESC LIMIT ? OFFSET ?`),
    addrTotals: q(`SELECT
        CAST(SUM(CASE WHEN t.kind = 'coinstake' THEN MAX(at.received - at.sent, 0) ELSE at.received END) AS TEXT) AS rcv,
        CAST(SUM(CASE WHEN t.kind = 'coinstake' THEN MAX(at.sent - at.received, 0) ELSE at.sent END) AS TEXT) AS snt
      FROM address_txs at JOIN txs t ON t.id = at.tx_id WHERE at.addr_id = ?`),
    lastTxs: q(`SELECT t.id, t.txid, t.height, t.time, t.kind FROM txs t WHERE t.height <= ? ORDER BY t.height DESC, t.idx DESC LIMIT ? OFFSET ?`),
    // valor mínimo como o eIquidus: transferência pelo total enviado; stake/coinbase pelo que o bloco criou (líquido)
    lastTxsMin: q(`SELECT t.id, t.txid, t.height, t.time, t.kind FROM txs t WHERE t.height <= ?1
      AND ((t.kind = 'normal' AND t.value_out >= ?2) OR (t.kind <> 'normal' AND t.value_out - t.value_in >= ?2))
      ORDER BY t.height DESC, t.idx DESC LIMIT ?3 OFFSET ?4`),
    mnRewards: q(`SELECT b.height, b.hash, b.time, b.mn_amount, t.id, t.txid FROM blocks b JOIN txs t ON t.height = b.height AND t.kind = (CASE b.kind WHEN 'pos' THEN 'coinstake' ELSE 'coinbase' END)
      WHERE b.mn_payee = ? AND b.height >= ? ORDER BY b.height`),
    mnRewardsTotal: q("SELECT COALESCE(SUM(mn_amount), 0) AS s FROM blocks WHERE mn_payee = ? AND height >= ?"),
  };

  // Transação no formato do banco do eIquidus (vin/vout agrupados por endereço, em satoshis).
  function eTx(t) {
    const merge = (rows) => {
      const out = [];
      const idx = new Map();
      for (const r of rows) {
        if (!r.address || !r.value) continue;
        if (idx.has(r.address)) out[idx.get(r.address)].amount += r.value;
        else { idx.set(r.address, out.length); out.push({ addresses: r.address, amount: r.value }); }
      }
      return out;
    };
    const vout = merge(st.outputs.all(t.id));
    let vin;
    if (t.kind === "coinbase") vin = [{ addresses: "coinbase", amount: vout.reduce((s, o) => s + o.amount, 0) }];
    else vin = merge(st.inputs.all(t.id));
    if (t.kind === "coinstake" && vin.length && vout.length && vin[0].addresses === vout[0].addresses) {
      vout[0].amount -= vin[0].amount;
      vin.shift();
    }
    const total = vout.reduce((s, o) => s + o.amount, 0);
    return { vin, vout, total };
  }

  const tip = () => api.tipInfo().height;
  const price = () => live.state.price?.usd ?? null;

  function gettx(txid) {
    const t = st.tx.get(String(txid).toLowerCase());
    if (!t) return { status: 200, body: { error: "tx not found.", hash: txid } };
    const e = eTx(t);
    const b = st.block.get(t.height);
    const h = tip();
    return {
      status: 200,
      body: {
        active: "tx",
        tx: {
          txid: t.txid,
          vin: e.vin.map((v) => ({ addresses: v.addresses, amount: String(v.amount) })),
          vout: e.vout.map((v) => ({ addresses: v.addresses, amount: String(v.amount) })),
          // o eIquidus guarda o total como Decimal128: zero sai "0E-8"
          total: e.total === 0 ? "0E-8" : e.total.toFixed(8), timestamp: t.time, blockhash: b?.hash, blockindex: t.height,
          tx_type: null, op_return: t.op_return || null, algo: null,
        },
        confirmations: h - t.height + 1,
        blockcount: h,
      },
    };
  }

  function getaddress(a) {
    const r = st.addr.get(canonicalAddress(a));
    if (!r) return { status: 200, body: { error: "address not found.", hash: a } };
    const tot = st.addrTotals.get(r.id);
    const rows = st.addrRows.all(r.id, 100, 0);
    return {
      status: 200,
      body: {
        address: r.address, sent: asXln(tot.snt || 0), received: asXln(tot.rcv || 0), balance: asXln(r.balance),
        last_txs: rows.map((x) => ({ addresses: x.txid, type: x.received >= x.sent ? "vout" : "vin" })),
      },
    };
  }

  function getaddresstxs(a, start, length) {
    const r = st.addr.get(canonicalAddress(a));
    if (!r) return { status: 200, body: [] };
    const n = Math.min(100, Math.max(0, Number(length) || 0));
    const rows = st.addrRows.all(r.id, n, Math.max(0, Number(start) || 0));
    return {
      status: 200,
      body: rows.map((x) => {
        let out = x.received, inn = x.sent;
        if (x.kind === "coinstake") { const net = x.received - x.sent; out = Math.max(net, 0); inn = Math.max(-net, 0); }
        return { timestamp: x.time, txid: x.txid, sent: asXln(out), received: asXln(inn), balance: asXln(x.balance) };
      }),
    };
  }

  function getlasttxs(min, start, length) {
    const n = Math.min(100, Math.max(0, Number(length) || 0));
    const s = Math.max(0, Number(start) || 0);
    const m = Math.round(Number(min) * SATS) || 0;
    const rows = m > 0 ? st.lastTxsMin.all(tip(), m, n * 3 + 20, s) : st.lastTxs.all(tip(), n, s);
    const out = [];
    for (const t of rows) {
      const e = eTx(t);
      if (m > 0 && e.total < m) continue;
      out.push({ blockindex: t.height, blockhash: st.block.get(t.height)?.hash, txid: t.txid, recipients: e.vout.length, amount: asXln(e.total), timestamp: t.time });
      if (out.length >= n) break;
    }
    return { status: 200, body: out };
  }

  function getdistribution() {
    const r = api.richlist();
    const keys = ["t_1_25", "t_26_50", "t_51_75", "t_76_100", "t_101plus"];
    const body = { supply: String(Number(r.supply)) };
    r.distribution.forEach((d, i) => { body[keys[i]] = { percent: d.percent.toFixed(2), total: Number(d.total).toFixed(8) }; });
    return { status: 200, body };
  }

  function mnList() {
    return live.state.masternodes.map((m) => ({
      rank: 0, network: m.network, txhash: m.txhash, outidx: m.outidx, status: m.status, addr: canonicalAddress(m.addr), version: m.version,
      lastseen: m.lastseen, activetime: m.activetime, lastpaid: m.lastpaid, claim_name: aliases?.nameOf(canonicalAddress(m.addr))?.name || "", ip_address: "", last_paid_block: 0,
    }));
  }

  function mnCount() {
    const c = live.state.mnCount || {};
    return { total: c.total ?? 0, stable: c.stable ?? 0, enabled: c.enabled ?? 0, inqueue: c.inqueue ?? 0, ipv4: c.ipv4 ?? 0, ipv6: c.ipv6 ?? 0, onion: c.onion ?? 0 };
  }

  function getsummary() {
    const s = api.stats();
    const c = live.state.mnCount || {};
    const p = price();
    return {
      difficulty: String(s.difficulty ?? ""), difficultyHybrid: "", supply: String(Number(s.supply)),
      hashrate: s.hashrate ? (s.hashrate / 1e9).toFixed(4) : "-", lastPrice: p === null ? "0" : String(p), lastUSDPrice: p === null ? "0" : String(p),
      connections: s.connections ?? 0, blockcount: s.height, masternodeCountOnline: c.enabled ?? c.stable ?? 0,
      masternodeCountOffline: Math.max(0, (c.total ?? 0) - (c.enabled ?? c.stable ?? 0)),
    };
  }

  function mnRewards(a, since) {
    a = canonicalAddress(a);
    const rows = st.mnRewards.all(a, Number(since) || 0).slice(0, 2000);
    return rows.map((r) => {
      const e = eTx({ id: r.id, kind: "coinstake" });
      return {
        txid: r.txid, vout: { addresses: a, amount: asXln(r.mn_amount) }, total: asXln(e.total), timestamp: r.time,
        blockhash: r.hash, blockindex: r.height, tx_type: null, op_return: null, algo: null,
      };
    });
  }

  // Encaminha ao node só os comandos de leitura que o eIquidus expunha.
  async function rpcPassthrough(name, query) {
    switch (name) {
      case "getblockcount": return { text: String(tip()) };
      case "getdifficulty": return { text: String(live.state.network?.difficulty ?? await rpc.call("getdifficulty")) };
      case "getconnectioncount": return { text: String(live.state.network?.connections ?? await rpc.call("getconnectioncount")) };
      case "getnetworkhashps": return { text: String(live.state.network?.hashrate ?? await rpc.call("getnetworkhashps")) };
      case "getmasternodecount": return { json: mnCount() };
      case "getblockhash": {
        const i = Number(query.get("index"));
        if (!Number.isInteger(i) || i < 0) return { text: "There was an error. Check your console." };
        return { text: String(await rpc.call("getblockhash", i)) };
      }
      case "getblock": {
        const h = String(query.get("hash") || "");
        if (!/^[0-9a-fA-F]{64}$/.test(h)) return { text: "There was an error. Check your console." };
        return { json: await rpc.call("getblock", h) };
      }
      case "getrawtransaction": {
        const id = String(query.get("txid") || "");
        if (!/^[0-9a-fA-F]{64}$/.test(id)) return { text: "There was an error. Check your console." };
        const decrypt = query.get("decrypt") === "1";
        return decrypt ? { json: await rpc.call("getrawtransaction", id, 1) } : { text: String(await rpc.call("getrawtransaction", id, 0)) };
      }
      case "getvotelist": return { text: "Error: Check your console" };
      default: throw new HttpError(404, "método não disponível");
    }
  }

  async function handle(pathname, query) {
    const parts = pathname.split("/").filter(Boolean); // ["ext", "gettx", ...] ou ["api", "getblockcount"]
    if (parts[0] === "api") {
      try { return await rpcPassthrough(parts[1], query); }
      catch (e) { if (e instanceof HttpError) throw e; return { text: "There was an error. Check your console." }; }
    }
    const [, name, a, b, c] = parts;
    switch (name) {
      case "gettx": return { json: gettx(a).body };
      case "getaddress": return { json: getaddress(a).body };
      case "getaddresstxs": return { json: getaddresstxs(a, b, c).body };
      case "getbalance": { const r = st.addr.get(canonicalAddress(a)); return r ? { text: asXln(r.balance) } : { json: { error: "address not found.", hash: a } }; }
      case "getmoneysupply": return { text: String(Number(api.supply().supply)) };
      case "getdistribution": return { json: getdistribution().body };
      case "getlasttxs": return { json: getlasttxs(a, b, c).body };
      case "getcurrentprice": { const p = price(); return { json: { last_price_usdt: p === null ? "0" : String(p), last_price_usd: p === null ? "0" : String(p) } }; }
      case "getbasicstats": { const s = api.stats(); const p = price(); return { json: { block_count: s.height, money_supply: String(Number(s.supply)), last_price_usdt: p === null ? "0" : String(p), last_price_usd: p === null ? "0" : String(p), masternode_count: mnCount().total } }; }
      case "getsummary": return { json: getsummary() };
      case "getnetworkpeers": return { json: live.state.peers.map((p) => ({ address: p.ip, port: p.addr.split(":").pop(), protocol: String(p.version), country: p.country || "", country_code: p.country_code || "", createdAt: new Date((p.conntime || 0) * 1000).toISOString(), version: (p.subver || "").replace(/^\/|\/$/g, "") })) };
      case "getmasternodelist": return { json: mnList() };
      case "getmasternoderewards": return { json: mnRewards(a, b) };
      case "getmasternoderewardstotal": return { text: (Number(st.mnRewardsTotal.get(canonicalAddress(a), Number(b) || 0).s) / SATS).toFixed(8) };
      default: throw new HttpError(404, "método não disponível");
    }
  }

  return { handle, eTx };
}
