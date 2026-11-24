// Explorer visitor counter (same idea as lunariumcoin.com's /api/visits.php):
// no cookies and no stored IPs. Only the COUNTRY is derived from the IP (in-memory cache by hash, never the IP on disk).
import crypto from "node:crypto";

const ONLINE_WINDOW = 90; // seconds without a signal before leaving "online now"
const BOT_UA = /bot|crawl|spider|slurp|curl|wget|python|httpclient|okhttp|java\/|go-http|axios|node-fetch|headless|lighthouse|monitor|uptime|preview|facebookexternalhit|whatsapp|telegrambot/i;

export function createVisits({ db, log = console.log }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS visit_days (day TEXT PRIMARY KEY, u INTEGER NOT NULL DEFAULT 0, v INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS visit_countries (cc TEXT PRIMARY KEY, u INTEGER NOT NULL DEFAULT 0, v INTEGER NOT NULL DEFAULT 0);
  `);
  const st = {
    meta: db.prepare("SELECT v FROM meta WHERE k = ?"),
    setMeta: db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v"),
    day: db.prepare(`INSERT INTO visit_days (day, u, v) VALUES (?, ?, ?)
      ON CONFLICT(day) DO UPDATE SET u = u + excluded.u, v = v + excluded.v`),
    cty: db.prepare(`INSERT INTO visit_countries (cc, u, v) VALUES (?, ?, ?)
      ON CONFLICT(cc) DO UPDATE SET u = u + excluded.u, v = v + excluded.v`),
    dayGet: db.prepare("SELECT u, v FROM visit_days WHERE day = ?"),
    ctyTop: db.prepare("SELECT cc, u, v FROM visit_countries ORDER BY u DESC, v DESC LIMIT 30"),
    ctyCount: db.prepare("SELECT COUNT(*) AS n FROM visit_countries"),
    prune: db.prepare("DELETE FROM visit_days WHERE day < ?"),
  };
  const num = (k) => Number(st.meta.get(k)?.v || 0);
  let total = num("visits_total");
  let views = num("visits_views");

  const online = new Map(); // sid → { t, cc }
  let events = []; // [{ cc, ts }] latest visits with country (memory only)
  const geoCache = new Map(); // hash(ip) → { cc, at }
  const salt = crypto.randomBytes(16).toString("hex"); // changes on every restart: the hash identifies no one
  const perIp = new Map(); // per-IP record limit (in memory, by hash)
  const perNet = new Map(); // new-visitor limit per network range (in memory, by hash)

  const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

  async function countryOf(ip) {
    if (!ip || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|fe80)/i.test(ip)) return null;
    const key = crypto.createHash("sha256").update(salt + ip).digest("hex").slice(0, 20);
    const c = geoCache.get(key);
    if (c && Date.now() - c.at < 7 * 86400000) return c.cc;
    let cc = null;
    try {
      const r = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(2500) });
      const j = await r.json();
      if (/^[A-Z]{2}$/.test(j?.country || "")) cc = j.country;
    } catch {}
    if (!cc) {
      try {
        const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`, { signal: AbortSignal.timeout(2500) });
        const j = await r.json();
        if (j?.success && /^[A-Z]{2}$/.test(j.country_code || "")) cc = j.country_code;
      } catch {}
    }
    if (cc) {
      geoCache.set(key, { cc, at: Date.now() });
      if (geoCache.size > 20000) geoCache.clear();
    }
    return cc;
  }

  function sweep() {
    const now = Date.now() / 1000;
    for (const [sid, s] of online) if (now - s.t > ONLINE_WINDOW) online.delete(sid);
    if (online.size > 20000) online.clear();
  }

  function snapshot() {
    sweep();
    const now = Math.floor(Date.now() / 1000);
    const series = [];
    for (let i = 6; i >= 0; i--) series.push(st.dayGet.get(dayKey(Date.now() - i * 86400000))?.u || 0);
    const occ = {};
    for (const s of online.values()) if (s.cc) occ[s.cc] = (occ[s.cc] || 0) + 1;
    return {
      ok: true,
      total,
      views,
      today: st.dayGet.get(dayKey())?.u || 0,
      online: online.size,
      series,
      countries: st.ctyTop.all().map((r) => ({ cc: r.cc, u: r.u, v: r.v })),
      ncountries: st.ctyCount.get().n,
      live: events.slice(-10).reverse().map((e) => ({ cc: e.cc, ts: e.ts, age: now - e.ts })),
      occ,
    };
  }

  // a = "hit" (first page of the visit), "view" (page change within the site), "beat" (still here), "read"
  async function handle({ a, sid, isNew, ip, ua }) {
    sid = String(sid || "").replace(/[^a-z0-9]/gi, "").slice(0, 32);
    const bot = BOT_UA.test(ua || "") || !ua;
    if (bot || !sid || !["hit", "view", "beat"].includes(a)) return snapshot();

    // at most 40 records per minute per origin (hash, memory only)
    const k = crypto.createHash("sha256").update(salt + ip).digest("hex").slice(0, 16);
    const now = Date.now();
    let lim = perIp.get(k);
    if (!lim || now - lim.start > 60000) { lim = { start: now, n: 0 }; perIp.set(k, lim); }
    if (++lim.n > 40) return snapshot();
    if (perIp.size > 50000) perIp.clear();

    // Network brake: at most 30 NEW visitors per hour from the same range (IPv4 /16, IPv6 /48).
    // Bots that rotate IPs within one range (e.g. 247 IPs in 152.163.x.x) stop here.
    if (a === "hit" && isNew) {
      const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.\d+\.\d+$/.exec(ip || "");
      const net = v4 ? `${v4[1]}.${v4[2]}` : String(ip || "").split(":").slice(0, 3).join(":");
      const nk = crypto.createHash("sha256").update(salt + "net" + net).digest("hex").slice(0, 16);
      let nl = perNet.get(nk);
      if (!nl || now - nl.start > 3600000) { nl = { start: now, n: 0 }; perNet.set(nk, nl); }
      if (++nl.n > 30) return snapshot();
      if (perNet.size > 50000) perNet.clear();
    }

    const t = Math.floor(now / 1000);
    if (a === "hit" || a === "view") {
      const cc = a === "hit" ? await countryOf(ip) : online.get(sid)?.cc || null;
      const u = a === "hit" && isNew ? 1 : 0;
      views += 1;
      total += u;
      st.day.run(dayKey(now), u, 1);
      if (cc) {
        st.cty.run(cc, u, 1);
        if (a === "hit") { events.push({ cc, ts: t }); if (events.length > 40) events = events.slice(-40); }
      }
      st.setMeta.run("visits_total", String(total));
      st.setMeta.run("visits_views", String(views));
      online.set(sid, { t, cc: cc || online.get(sid)?.cc || null });
    } else if (a === "beat") {
      const cur = online.get(sid);
      online.set(sid, { t, cc: cur?.cc || null });
    }
    return snapshot();
  }

  // days older than 400 days are pruned (the all-time total stays)
  setInterval(() => { try { st.prune.run(dayKey(Date.now() - 400 * 86400000)); } catch {} sweep(); }, 3600000).unref();

  return { handle, snapshot };
}
