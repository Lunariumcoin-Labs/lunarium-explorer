// Explorador oficial da LunariumCoin: indexador + API + site, num processo só.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { config } from "./config.mjs";
import { openDb } from "./db.mjs";
import { createRpc } from "./rpc.mjs";
import { createLive } from "./live.mjs";
import { createApi, HttpError } from "./api.mjs";
import { createCompat } from "./compat.mjs";
import { createVisits } from "./visits.mjs";

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

const db = openDb(config.dbPath);
const rpc = createRpc(config.rpc);
const live = createLive({ db, rpc, priceUrl: config.priceUrl, log });
const api = createApi({ db, rpc, live });
const compat = createCompat({ db, rpc, live, api });
const visits = createVisits({ db, log });

function readBody(req, max = 2048) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > max) { req.destroy(); resolve(""); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

// ---------- arquivos do site ----------
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2",
};
const SPA_ROUTES = /^\/(|blocks|block\/[^/]+|tx\/[^/]+|address\/[^/]+|masternodes|richlist|network|movement|supply|charts|mempool|api-docs|info|search)\/?$/;
const indexHtmlPath = path.join(config.webDir, "index.html");

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function serveStatic(req, res, pathname) {
  if (pathname.includes("..") || /(^|\/)\./.test(pathname)) return false;
  const file = path.join(config.webDir, pathname);
  if (!file.startsWith(config.webDir)) return false;
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  // imagens: 7 dias; código (js/css): sempre revalida (304 se não mudou), para atualização chegar na hora
  const longCache = pathname.startsWith("/assets/");
  const lastMod = stat.mtime.toUTCString();
  if (!longCache && req.headers["if-modified-since"] === lastMod) {
    res.writeHead(304, { "cache-control": "no-cache", "last-modified": lastMod });
    return res.end(), true;
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "content-type": MIME[ext] || "application/octet-stream",
    "content-length": stat.size,
    "last-modified": lastMod,
    "cache-control": longCache ? "public, max-age=604800" : "no-cache",
  });
  if (req.method === "HEAD") return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}

function sendIndex(res, status = 200) {
  const html = fs.readFileSync(indexHtmlPath);
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": MIME[".html"], "cache-control": "no-cache" });
  res.end(html);
}

function sendJson(res, status, body, cache = "no-cache") {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8", "content-length": data.length, "cache-control": cache,
    "access-control-allow-origin": "*", "x-content-type-options": "nosniff",
  });
  res.end(data);
}
function sendText(res, status, text) {
  const data = Buffer.from(String(text));
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "content-length": data.length, "access-control-allow-origin": "*", "cache-control": "no-cache" });
  res.end(data);
}

// ---------- limite de requisições (por IP, janela de 1 minuto) ----------
const hits = new Map();
const LIMIT_PER_MIN = Number(process.env.EXPLORER_RATE_LIMIT || 600);
function clientIp(req) {
  const remote = req.socket.remoteAddress || "";
  const local = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(remote);
  const fwd = local ? String(req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "";
  return fwd || remote;
}
function rateLimited(ip) {
  if (/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ip)) return false;
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || now - h.start > 60000) { h = { start: now, n: 0 }; hits.set(ip, h); }
  h.n += 1;
  return h.n > LIMIT_PER_MIN;
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (now - h.start > 120000) hits.delete(ip); }, 60000).unref();

// ---------- eventos ao vivo (novos blocos) ----------
const streams = new Set();
let lastTip = null;
setInterval(() => {
  const t = api.tipInfo();
  if (t.height === lastTip) return;
  const prev = lastTip;
  lastTip = t.height;
  if (prev === null || !streams.size) return;
  const payload = JSON.stringify({ stats: api.stats(), blocks: api.blocks({ limit: Math.min(10, Math.max(1, t.height - prev)) }), txs: api.recentTxs(10) });
  for (const res of streams) res.write(`event: tip\ndata: ${payload}\n\n`);
}, 2000).unref();
setInterval(() => { for (const res of streams) res.write(": ping\n\n"); }, 25000).unref();

// ---------- rotas da API nova ----------
async function apiV1(req, res, parts, query) {
  const [name, a, b] = parts;
  const short = "public, max-age=5";
  switch (name) {
    case "stats": return sendJson(res, 200, api.stats(), short);
    case "supply": return sendJson(res, 200, api.supply(), "public, max-age=30");
    case "blocks": return sendJson(res, 200, api.blocks({ before: query.get("before"), limit: query.get("limit") }), short);
    case "block": return sendJson(res, 200, api.block(a), "public, max-age=10");
    case "tx": return sendJson(res, 200, await api.tx(a), "public, max-age=10");
    case "address":
      if (b === "txs") return sendJson(res, 200, api.addressTxs(a, { offset: query.get("offset"), limit: query.get("limit") }), short);
      if (b === "utxos") return sendJson(res, 200, api.addressUtxos(a), short);
      return sendJson(res, 200, api.address(a), short);
    case "richlist": return sendJson(res, 200, api.richlist(), "public, max-age=60");
    case "movement": return sendJson(res, 200, api.movement({ min: query.get("min") ?? 1000, limit: query.get("limit"), before: query.get("before") }), short);
    case "txs": return sendJson(res, 200, api.recentTxs(query.get("limit")), short);
    case "charts": return sendJson(res, 200, api.charts(query.get("days")), "public, max-age=300");
    case "search": return sendJson(res, 200, await api.search(query.get("q")), "no-cache");
    case "masternodes": return sendJson(res, 200, api.masternodes(), "public, max-age=30");
    case "peers": return sendJson(res, 200, api.peers(), "public, max-age=60");
    case "mempool": return sendJson(res, 200, await api.mempool(), short);
    case "stream": {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
      res.write(`event: hello\ndata: ${JSON.stringify({ height: api.tipInfo().height })}\n\n`);
      streams.add(res);
      req.on("close", () => streams.delete(res));
      if (streams.size > 2000) { streams.delete(res); res.end(); }
      return;
    }
    default: throw new HttpError(404, "rota não existe");
  }
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, "http://x"); } catch { return sendText(res, 400, "bad request"); }
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, HEAD", "access-control-max-age": "86400" });
      return res.end();
    }
    if (pathname === "/api/v1/visits") {
      let p = url.searchParams;
      if (req.method === "POST") {
        const raw = await readBody(req);
        try { p = raw.trim().startsWith("{") ? new URLSearchParams(JSON.parse(raw)) : new URLSearchParams(raw); } catch { p = new URLSearchParams(); }
      }
      const out = await visits.handle({ a: p.get("a") || "read", sid: p.get("sid"), isNew: p.get("new") === "1", ip: clientIp(req), ua: req.headers["user-agent"] || "" });
      return sendJson(res, 200, out, "no-store");
    }
    if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "method not allowed");

    const isApi = pathname.startsWith("/api/") || pathname.startsWith("/ext/");
    if (isApi && rateLimited(clientIp(req))) return sendJson(res, 429, { error: "muitas requisições; tente de novo em 1 minuto" });

    if (pathname.startsWith("/api/v1/")) return await apiV1(req, res, pathname.slice(8).split("/").filter(Boolean), url.searchParams);
    if (isApi) {
      const r = await compat.handle(pathname, url.searchParams);
      return r.json !== undefined ? sendJson(res, 200, r.json) : sendText(res, 200, r.text);
    }
    if (pathname === "/healthz") {
      const t = api.tipInfo();
      return sendJson(res, 200, { ok: true, height: t.height, behindSeconds: t.time ? Math.round(Date.now() / 1000 - t.time) : null });
    }
    if (SPA_ROUTES.test(pathname)) return sendIndex(res);
    if (pathname === "/favicon.ico") return serveStatic(req, res, "/assets/logo.png") || sendText(res, 404, "");
    if (pathname === "/robots.txt") return sendText(res, 200, `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /ext/\n`);
    if (serveStatic(req, res, pathname)) return;
    return sendIndex(res, 404);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) log(`erro em ${pathname}: ${e.stack || e.message}`);
    if (pathname.startsWith("/api/") || pathname.startsWith("/ext/")) return sendJson(res, status, { error: status === 500 ? "erro interno" : e.message });
    return sendText(res, status, status === 500 ? "erro interno" : e.message);
  }
});

server.listen(config.port, config.host, () => log(`explorador em http://${config.host}:${config.port}`));
live.start();

// O indexador roda numa thread própria (escrita no banco sem travar o site); reinicia sozinho se cair.
let worker = null;
function startWorker() {
  worker = new Worker(new URL("./indexer-worker.mjs", import.meta.url), {
    workerData: { dbPath: config.dbPath, rpc: config.rpc, batchBlocks: config.batchBlocks },
  });
  worker.on("message", (m) => {
    if (m?.type === "log") log(m.msg);
    else if (m?.type === "tip") live.refreshMempool().catch(() => {});
  });
  worker.on("error", (e) => log(`indexador caiu: ${e.stack || e.message}`));
  worker.on("exit", (code) => { if (!stopping) { log(`indexador saiu (${code}); reiniciando em 10 s`); setTimeout(startWorker, 10000); } });
}
let stopping = false;
if (config.indexer) startWorker();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log("encerrando…");
    stopping = true;
    worker?.postMessage({ type: "stop" });
    live.stop();
    server.close();
    setTimeout(() => { try { db.close(); } catch {} process.exit(0); }, 1500);
  });
}
