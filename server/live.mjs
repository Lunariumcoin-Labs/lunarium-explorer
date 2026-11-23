// Dados "ao vivo" que não ficam no banco: rede, masternodes, peers, mempool, preço.
// Cada item é atualizado em segundo plano no seu próprio ritmo; a API só lê o último valor.
import { getMeta, setMeta } from "./db.mjs";

export function createLive({ db, rpc, priceUrl, log = console.log }) {
  const state = {
    network: null,      // { difficulty, hashrate, connections, version, protocol, subversion }
    masternodes: [],    // saída de listmasternodes
    mnCount: null,      // saída de getmasternodecount
    peers: [],          // getpeerinfo + país
    mempool: [],        // txids sem confirmação
    txoutset: null,     // gettxoutsetinfo (conferência da oferta pelo próprio node)
    price: null,        // { usd, change24h, source, volume24h, at }
    updated: {},
  };

  const geo = new Map(Object.entries(JSON.parse(getMeta(db, "peer_geo", "{}"))));

  async function refreshNetwork() {
    const [info, net, hashps, mnc] = await rpc.batch([["getblockchaininfo"], ["getnetworkinfo"], ["getnetworkhashps"], ["getmasternodecount"]]);
    if (info instanceof Error) throw info;
    state.network = {
      difficulty: info.difficulty,
      connections: net instanceof Error ? null : net.connections,
      version: net instanceof Error ? null : net.version,
      subversion: net instanceof Error ? null : net.subversion,
      protocol: net instanceof Error ? null : net.protocolversion,
      hashrate: hashps instanceof Error ? null : hashps,
    };
    if (!(mnc instanceof Error)) state.mnCount = mnc;
    state.updated.network = Date.now();
  }

  async function refreshMasternodes() {
    const list = await rpc.call("listmasternodes");
    if (Array.isArray(list)) state.masternodes = list;
    state.updated.masternodes = Date.now();
  }

  // Nós de versão antiga (2.x/3.x, protocolo < 70960) estão parados fora da ponta da rede e não servem para nada:
  // o node do explorador não conversa com eles (ban de 1 ano). Só vale para o NOSSO node — tirar da rede
  // inteira exige o spork de versão mínima (SPORK_14), que depende da chave spork.
  const MIN_PROTOCOL = Number(process.env.EXPLORER_MIN_PEER_PROTOCOL || 70960);
  async function banOldPeers(peers) {
    for (const p of peers) {
      if (!(p.version > 0) || p.version >= MIN_PROTOCOL) continue;
      const ip = hostOf(p.addr);
      if (!ip) continue;
      try {
        await rpc.call("setban", ip, "add", 365 * 86400);
        log(`nó antigo banido do explorador: ${ip} (${(p.subver || "").replace(/^\/|\/$/g, "")}, protocolo ${p.version})`);
      } catch (e) {
        if (!/already banned/i.test(e.message)) log(`não consegui banir ${ip}: ${e.message}`);
      }
    }
  }

  async function refreshPeers() {
    let peers = await rpc.call("getpeerinfo");
    if (peers.some((p) => p.version > 0 && p.version < MIN_PROTOCOL)) {
      await banOldPeers(peers);
      peers = await rpc.call("getpeerinfo");
    }
    const ips = [...new Set(peers.map((p) => hostOf(p.addr)).filter((ip) => ip && !geo.has(ip) && isPublicIp(ip)))];
    if (ips.length) {
      try {
        // ip-api.com (lote de até 100 IPs): só o IP público do nó, que já é público na rede P2P.
        const r = await fetch("http://ip-api.com/batch?fields=status,query,country,countryCode", {
          method: "POST", body: JSON.stringify(ips.slice(0, 100)), signal: AbortSignal.timeout(15000),
        });
        const arr = await r.json();
        for (const g of arr) if (g.status === "success") geo.set(g.query, { country: g.country, code: g.countryCode });
        setMeta(db, "peer_geo", JSON.stringify(Object.fromEntries([...geo].slice(-2000))));
      } catch (e) { log(`geo dos peers indisponível: ${e.message}`); }
    }
    // Infraestrutura da Lunarium (VPS da hospedagem/explorador) não aparece na lista pública: qualquer peer
    // conectado por nome (addnode=host) e os IPs de EXPLORER_HIDE_PEERS.
    const hidden = new Set(String(process.env.EXPLORER_HIDE_PEERS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
    const isIp = (h) => /^[0-9.]+$/.test(h || "") || (h || "").includes(":");
    peers = peers.filter((p) => { const h = hostOf(p.addr); return h && isIp(h) && !hidden.has(h.toLowerCase()); });
    state.peers = peers.map((p) => {
      const ip = hostOf(p.addr);
      const g = geo.get(ip) || null;
      return {
        addr: p.addr, ip, network: ip?.includes(":") ? "ipv6" : /\.onion$/.test(ip || "") ? "onion" : "ipv4",
        version: p.version, subver: p.subver, inbound: p.inbound, conntime: p.conntime,
        pingtime: p.pingtime ?? null, startingheight: p.startingheight, synced_blocks: p.synced_blocks ?? null,
        country: g?.country || null, country_code: g?.code || null,
      };
    });
    state.updated.peers = Date.now();
  }

  async function refreshMempool() {
    const ids = await rpc.call("getrawmempool");
    state.mempool = Array.isArray(ids) ? ids : [];
    state.updated.mempool = Date.now();
  }

  async function refreshTxoutset() {
    state.txoutset = await rpc.call("gettxoutsetinfo");
    state.updated.txoutset = Date.now();
  }

  async function refreshPrice() {
    if (!priceUrl) return;
    const r = await fetch(priceUrl, { signal: AbortSignal.timeout(20000), headers: { accept: "application/json" } });
    const j = await r.json();
    const d = j?.data || j;
    if (typeof d?.price_usd === "number" && d.price_usd > 0) {
      state.price = { usd: d.price_usd, change24h: d.change_24h_pct ?? null, source: d.price_source || null, volume24h: d.volume_24h_usd ?? null, at: Date.now() };
      state.updated.price = Date.now();
    }
  }

  const timers = [];
  function every(ms, fn, name) {
    const run = async () => {
      try { await fn(); } catch (e) { log(`${name}: ${e.message}`); }
    };
    run();
    timers.push(setInterval(run, ms));
  }

  function start() {
    every(15000, refreshNetwork, "rede");
    every(10000, refreshMempool, "mempool");
    every(60000, refreshMasternodes, "masternodes");
    every(120000, refreshPeers, "peers");
    every(15 * 60000, refreshTxoutset, "gettxoutsetinfo");
    every(5 * 60000, refreshPrice, "preço");
  }
  function stop() { timers.forEach(clearInterval); }

  return { state, start, stop, refreshMasternodes, refreshMempool };
}

function hostOf(addr) {
  if (!addr) return null;
  const m = /^\[(.+)\]:\d+$/.exec(addr);
  if (m) return m[1];
  const i = addr.lastIndexOf(":");
  return i > 0 && addr.indexOf(":") === i ? addr.slice(0, i) : addr;
}

function isPublicIp(ip) {
  if (/\.onion$/.test(ip)) return false;
  if (/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/.test(ip)) return false;
  if (/^(::1$|fe80:|fc|fd)/i.test(ip)) return false;
  return true;
}
