// Teste comparativo: as rotas antigas (/api, /ext) do explorador NOVO devem responder igual ao eIquidus
// (explorerxln.com hoje). Só leitura. Uso:
//   node tools/compat-diff.mjs <url-do-novo> [url-do-antigo] [quantidade]
// Ex.: node tools/compat-diff.mjs http://127.0.0.1:18795 https://explorerxln.com 60
const NEW = process.argv[2] || "http://127.0.0.1:18795";
const OLD = process.argv[3] || "https://explorerxln.com";
const N = Number(process.argv[4] || 40);

async function get(base, path, text = false) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
      const body = await r.text();
      if (text) return body.trim();
      try { return JSON.parse(body); } catch { return { __text: body.trim().slice(0, 200) }; }
    } catch (e) { if (i === 2) return { __error: e.message }; await new Promise((r) => setTimeout(r, 1000)); }
  }
}

// Campos que mudam com o tempo e não são comparados literalmente.
const VOLATILE = new Set(["confirmations", "blockcount", "lastseen", "activetime", "lastpaid", "createdAt", "connections", "rank"]);
function diff(a, b, path = "", out = []) {
  if (out.length > 12) return out;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) { out.push(`${path}: tipo ${typeof a} x ${typeof b}`); return out; }
    if (a.length !== b.length) out.push(`${path}: ${a.length} itens x ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], `${path}[${i}]`, out);
    return out;
  }
  if (a && typeof a === "object" && b && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (VOLATILE.has(k)) continue;
      if (!(k in a)) out.push(`${path}.${k}: falta no novo`);
      else if (!(k in b)) out.push(`${path}.${k}: sobra no novo`);
      else diff(a[k], b[k], `${path}.${k}`, out);
    }
    return out;
  }
  if (a !== b) out.push(`${path}: novo=${JSON.stringify(a)} antigo=${JSON.stringify(b)}`);
  return out;
}

const results = { ok: 0, fail: 0, failures: [] };
async function compare(label, path, { text = false, normalize = (x) => x } = {}) {
  const [a, b] = await Promise.all([get(NEW, path, text), get(OLD, path, text)]);
  const d = text ? (a === b ? [] : [`novo=${JSON.stringify(a).slice(0, 120)} antigo=${JSON.stringify(b).slice(0, 120)}`]) : diff(normalize(a), normalize(b));
  if (d.length) { results.fail++; results.failures.push({ label, path, d }); }
  else results.ok++;
}

// Altura comum: o antigo e o novo precisam estar na mesma ponta para comparar saldos.
const [hNew, hOld] = await Promise.all([get(NEW, "/api/getblockcount", true), get(OLD, "/api/getblockcount", true)]);
console.log(`altura: novo ${hNew} · antigo ${hOld}`);
if (Math.abs(Number(hNew) - Number(hOld)) > 3) console.log("AVISO: alturas diferentes; saldos recentes podem divergir só por isso.");

// Amostras reais vindas do explorador antigo
const last = await get(OLD, `/ext/getlasttxs/0/0/${N}`);
const big = await get(OLD, `/ext/getlasttxs/100/0/${N}`);
const mns = await get(OLD, "/ext/getmasternodelist");
const txids = [...new Set([...(last || []), ...(big || [])].map((t) => t.txid))].slice(0, N * 2);
const addrs = new Set();
for (const id of txids.slice(0, N)) {
  const t = await get(OLD, `/ext/gettx/${id}`);
  for (const v of [...(t?.tx?.vin || []), ...(t?.tx?.vout || [])]) if (/^L/.test(v.addresses)) addrs.add(v.addresses);
}
for (const m of (Array.isArray(mns) ? mns : []).slice(0, 15)) addrs.add(m.addr);
const addrList = [...addrs].slice(0, N);
console.log(`amostras: ${txids.length} transações, ${addrList.length} endereços`);

for (const id of txids) await compare("gettx", `/ext/gettx/${id}`);
for (const a of addrList) {
  await compare("getaddress", `/ext/getaddress/${a}`);
  await compare("getbalance", `/ext/getbalance/${a}`, { text: true });
  await compare("getaddresstxs", `/ext/getaddresstxs/${a}/0/50`);
}
for (const m of (Array.isArray(mns) ? mns : []).slice(0, 8)) {
  const since = Number(hOld) - 3000;
  await compare("getmasternoderewards", `/ext/getmasternoderewards/${m.addr}/${since}`);
  await compare("getmasternoderewardstotal", `/ext/getmasternoderewardstotal/${m.addr}/${since}`, { text: true });
}
await compare("getlasttxs", `/ext/getlasttxs/0/0/20`);
await compare("getlasttxs min", `/ext/getlasttxs/100/0/20`);
await compare("getmoneysupply", `/ext/getmoneysupply`, { text: true });
await compare("getdistribution", `/ext/getdistribution`);
await compare("getmasternodecount", `/api/getmasternodecount`);
await compare("getmasternodelist", `/ext/getmasternodelist`, { normalize: (l) => (Array.isArray(l) ? [...l].sort((x, y) => (x.txhash + x.outidx).localeCompare(y.txhash + y.outidx)) : l) });
await compare("getblockhash", `/api/getblockhash?index=1000000`, { text: true });
await compare("getrawtransaction", `/api/getrawtransaction?txid=${txids[0]}&decrypt=1`);
await compare("gettx inexistente", `/ext/gettx/${"0".repeat(64)}`);
await compare("getaddress inexistente", `/ext/getaddress/LXXXinvalid`);

console.log(`\nIGUAIS: ${results.ok}   DIFERENTES: ${results.fail}`);
const byLabel = {};
for (const f of results.failures) (byLabel[f.label] ||= []).push(f);
for (const [label, list] of Object.entries(byLabel)) {
  console.log(`\n== ${label}: ${list.length} diferença(s)`);
  for (const f of list.slice(0, 4)) console.log(`  ${f.path}\n    ${f.d.slice(0, 5).join("\n    ")}`);
}
