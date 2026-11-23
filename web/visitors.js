// Visitantes do explorador: registro da visita (sem cookies; só um id de sessão no sessionStorage),
// faixa "Pulso da comunidade" e o globo de pontos com os países (adaptado do globo do lunariumcoin.com).
import { t, intlTag } from "./i18n.js";
import { countryFlag } from "./flags.js";

const API = "/api/v1/visits";
let sid = null;
let last = null;
const listeners = new Set();

function post(a, extra = {}) {
  const body = new URLSearchParams({ a, sid, ...extra });
  return fetch(API, { method: "POST", body, cache: "no-store" }).then((r) => r.json()).then((r) => {
    if (r && r.ok) { last = r; listeners.forEach((fn) => fn(r)); }
    return r;
  }).catch(() => null);
}

let counted = false;

export function startVisits() {
  // navegador automatizado (robôs que executam JavaScript) não conta
  try { if (navigator.webdriver) return; } catch {}
  let id = null;
  try { id = sessionStorage.getItem("xln_explorer_sid"); } catch {}
  if (!id) {
    id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    try { sessionStorage.setItem("xln_explorer_sid", id); } catch {}
  }
  // Só conta quem fica de verdade: um toque/clique/tecla real ou 10 s com a página visível.
  // Robôs abrem a página e saem em ~3 s sem interagir (23/11/2026: 632 "visitantes" falsos assim).
  const evs = ["pointerdown", "touchstart", "keydown", "wheel"];
  let shown = 0;
  const timer = setInterval(() => { if (!document.hidden && ++shown >= 10) go(); }, 1000);
  const onInput = (e) => { if (e.isTrusted) go(); };
  function go() {
    if (counted) return;
    counted = true;
    clearInterval(timer);
    evs.forEach((ev) => removeEventListener(ev, onInput, true));
    sid = id;
    let isNew = "1";
    try { if (localStorage.getItem("xln_explorer_seen")) isNew = "0"; else localStorage.setItem("xln_explorer_seen", "1"); } catch {}
    post("hit", { new: isNew });
    setInterval(() => { if (!document.hidden) post("beat"); }, 45000);
  }
  evs.forEach((ev) => addEventListener(ev, onInput, { capture: true, passive: true }));
}
export function trackView() { if (sid && counted) post("view"); }

const regionName = (cc) => {
  try { return new Intl.DisplayNames([intlTag().split("-u-")[0]], { type: "region" }).of(cc) || cc; } catch { return cc; }
};
const nf = (n) => new Intl.NumberFormat(intlTag()).format(n || 0);
const flag = (cc) => countryFlag(cc);

export function visitorsHtml() {
  return `
  <section class="vis-strip card" id="visStrip">
    <div class="vis-head"><span class="vis-live"><span class="live-dot"></span>${t("visLive")}</span><span class="vis-title">${t("visTitle")}</span><span class="soft vis-priv">${t("visPrivacy")}</span></div>
    <div class="vis-grid">
      <div class="vis-cell vis-big"><div class="vis-ico">${ICON_GLOBE}</div><div class="vis-txt"><b id="vTotal">—</b><span>${t("visTotal")}</span></div><svg id="vSpark" viewBox="0 0 120 36" preserveAspectRatio="none" aria-label="${t("vis7d")}"></svg></div>
      <div class="vis-cell"><div class="vis-ico green">${ICON_USER}</div><div class="vis-txt"><b id="vOnline">—</b><span>${t("visOnline")}</span></div></div>
      <div class="vis-cell"><div class="vis-ico gold">${ICON_CAL}</div><div class="vis-txt"><b id="vToday">—</b><span>${t("visToday")}</span></div></div>
    </div>
  </section>
  <section class="gl-card card" id="globeSec">
    <div class="gl-left">
      <div class="gl-head"><div><div class="eyebrow">${t("glLabel")}</div><h2 class="gl-title">${t("glTitle")}</h2></div><div class="gl-kpi"><b id="glNC">0</b><span>${t("glCountries")}</span></div></div>
      <div class="gl-stage"><canvas id="glCanvas" aria-label="${t("glTitle")}"></canvas><div class="gl-hint">${t("glHint")}</div></div>
    </div>
    <div class="gl-right">
      <h3 class="gl-h3"><span class="live-dot"></span>${t("glRank")}</h3>
      <div id="glRank" class="gl-rank"><div class="soft">${t("glWait")}</div></div>
      <h3 class="gl-h3">${t("glLive")}</h3>
      <div id="glFeed" class="gl-feed"></div>
    </div>
  </section>`;
}

const ICON_GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg>';
const ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
const ICON_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

// Liga a faixa e o globo da página atual. Devolve uma função para desligar (ao sair da página).
export function mountVisitors(root) {
  const cleanup = [];
  const cur = { vTotal: 0, vOnline: 0, vToday: 0 };
  function tween(id, to) {
    const el = root.querySelector("#" + id);
    if (!el) return;
    const from = cur[id], t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 1000), e = 1 - Math.pow(1 - p, 3);
      el.textContent = nf(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(step); else cur[id] = to;
    };
    requestAnimationFrame(step);
  }
  function spark(arr) {
    const sv = root.querySelector("#vSpark");
    if (!sv || !arr || arr.length < 2) return;
    const mx = Math.max(1, ...arr), n = arr.length;
    const pts = arr.map((v, i) => [i * (120 / (n - 1)), 32 - (v / mx) * 28]);
    const l = "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
    sv.innerHTML = `<defs><linearGradient id="visGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1fa3c2" stop-opacity=".4"/><stop offset="1" stop-color="#1fa3c2" stop-opacity="0"/></linearGradient></defs><path d="${l} L120 36 L0 36Z" fill="url(#visGrad)"/><path d="${l}" fill="none" stroke="#32b9d6" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle cx="${pts[n - 1][0].toFixed(1)}" cy="${pts[n - 1][1].toFixed(1)}" r="2.4" fill="#6fe3f7"/>`;
  }
  function paintStrip(r) {
    tween("vTotal", r.total);
    tween("vOnline", Math.max(1, r.online));
    tween("vToday", r.today);
    spark(r.series);
  }
  const onData = (r) => { paintStrip(r); globe?.apply(r); };
  listeners.add(onData);
  cleanup.push(() => listeners.delete(onData));

  let globe = null;
  const sec = root.querySelector("#globeSec");
  if (sec) {
    let started = false;
    const io = new IntersectionObserver((en) => {
      const vis = en[0].isIntersecting;
      if (vis && !started) {
        started = true;
        import("./globe-data.js").then((m) => {
          globe = createGlobe(sec, m.default);
          if (last) globe.apply(last);
          globe.setVisible(true);
        });
      } else if (globe) globe.setVisible(vis);
    }, { threshold: 0.05 });
    io.observe(sec);
    cleanup.push(() => io.disconnect());
    const poll = setInterval(() => { if (globe?.visible && !document.hidden) post("read"); }, 8000);
    cleanup.push(() => clearInterval(poll));
    cleanup.push(() => globe?.destroy());
  }
  if (last) onData(last); else post("read");
  return () => cleanup.forEach((fn) => fn());
}

function createGlobe(sec, GLD) {
  const cv = sec.querySelector("#glCanvas"), ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bin = atob(GLD.dots), N = bin.length / 6;
  const dv = new DataView(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) dv.setUint8(i, bin.charCodeAt(i));
  const DLon = new Float32Array(N), sinP = new Float32Array(N), cosP = new Float32Array(N), DCC = new Array(N);
  const byNum = {};
  for (const a in GLD.A2N) byNum[GLD.A2N[a]] = a;
  for (let i = 0; i < N; i++) {
    const la = (dv.getInt16(i * 6, true) / 50) * Math.PI / 180, lo = (dv.getInt16(i * 6 + 2, true) / 50) * Math.PI / 180;
    DLon[i] = lo; sinP[i] = Math.sin(la); cosP[i] = Math.cos(la); DCC[i] = byNum[dv.getUint16(i * 6 + 4, true)] || "";
  }
  let W = 0, H = 0, R = 0, dpr = 1, lam = -0.9, phi = 0.35, vLam = 0.0035, drag = false, lastX = 0, lastY = 0, focus = null, focusUntil = 0;
  let data = { countries: [], live: [], occ: {}, ncountries: 0 }, level = {}, rings = [], seen = {}, first = true, visible = false, tFetch = 0, raf = 0, dead = false;
  const rankEl = sec.querySelector("#glRank"), feedEl = sec.querySelector("#glFeed");

  function resize() {
    const r = cv.getBoundingClientRect();
    W = Math.max(200, r.width); H = W; dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px"; R = W * 0.43;
  }
  function renderRank() {
    const c = data.countries;
    let tot = 0;
    c.forEach((x) => { tot += x.u; });
    sec.querySelector("#glNC").textContent = nf(data.ncountries || 0);
    if (!c.length) { rankEl.innerHTML = `<div class="soft">${t("glWait")}</div>`; return; }
    const mx = c[0].u || 1;
    rankEl.innerHTML = c.slice(0, 8).map((x, i) => {
      const pct = tot ? (x.u / tot) * 100 : 0;
      return `<button class="gl-row" data-cc="${x.cc}"><span class="gl-n">${i + 1}</span><span class="gl-flag">${flag(x.cc)}</span><span class="gl-name">${regionName(x.cc)}</span><span class="gl-bar"><i style="width:${Math.max(4, (x.u / mx) * 100).toFixed(1)}%"></i></span><span class="gl-val">${nf(x.u)}<em>${pct.toFixed(pct < 10 ? 1 : 0)}%</em></span></button>`;
    }).join("");
  }
  const agoS = (s) => { s = Math.max(0, Math.round(s)); return s < 60 ? s + "s" : s < 3600 ? Math.floor(s / 60) + "m" : Math.floor(s / 3600) + "h"; };
  function renderFeed() {
    const now = (performance.now() - tFetch) / 1000;
    feedEl.innerHTML = (data.live || []).slice(0, 5).map((e) => `<div class="gl-ev"><span class="gl-evdot"></span><span class="gl-flag">${flag(e.cc)}</span><span class="gl-evn">${regionName(e.cc)}</span><span class="gl-evt">${agoS(e.age + now)}</span></div>`).join("");
  }
  function focusCC(cc, hold) { const c = GLD.C[cc]; if (!c) return; focus = { lat: c[0] * Math.PI / 180, lon: c[1] * Math.PI / 180 }; focusUntil = performance.now() + (hold ? 6000 : 3000); }
  rankEl.addEventListener("click", (e) => { const b = e.target.closest(".gl-row"); if (b) focusCC(b.dataset.cc, true); });
  rankEl.addEventListener("mouseover", (e) => { const b = e.target.closest(".gl-row"); if (b) focusCC(b.dataset.cc, false); });
  function ping(cc) {
    const c = GLD.C[cc]; if (!c) return;
    rings.push({ lat: c[0] * Math.PI / 180, lon: c[1] * Math.PI / 180, t0: performance.now(), cc });
    if (!drag) { focus = { lat: c[0] * Math.PI / 180, lon: c[1] * Math.PI / 180 }; focusUntil = performance.now() + 3500; }
  }
  function apply(r) {
    if (!r || !r.ok) return;
    tFetch = performance.now();
    data = { countries: r.countries || [], live: r.live || [], occ: r.occ || {}, ncountries: r.ncountries || 0 };
    const mx = data.countries.length ? data.countries[0].u || 1 : 1;
    level = {};
    data.countries.forEach((x) => { level[x.cc] = 0.35 + 0.65 * Math.sqrt((x.u || 0) / mx); });
    Object.keys(data.occ).forEach((cc) => { if (level[cc] == null) level[cc] = 0.5; });
    let fresh = [];
    data.live.forEach((e) => { const k = e.cc + "|" + Math.round(e.ts); if (!seen[k]) { seen[k] = 1; fresh.push(e); } });
    fresh = first ? fresh.slice(0, 3).reverse() : fresh.reverse();
    fresh.forEach((e, i) => setTimeout(() => ping(e.cc), i * 700));
    first = false;
    renderRank(); renderFeed();
  }
  cv.addEventListener("pointerdown", (e) => { drag = true; lastX = e.clientX; lastY = e.clientY; vLam = 0; focus = null; try { cv.setPointerCapture(e.pointerId); } catch {} });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    lam -= (dx / R) * 0.9; phi = Math.max(-1.1, Math.min(1.1, phi + (dy / R) * 0.9)); vLam = (-dx / R) * 0.9;
  });
  const up = () => { drag = false; if (Math.abs(vLam) < 0.001) vLam = 0.0035; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  function draw(now) {
    if (dead) return;
    if (!visible || document.hidden) { raf = requestAnimationFrame(draw); return; }
    if (focus && now < focusUntil && !drag) { lam += angDiff(focus.lon, lam) * 0.045; phi += (Math.max(-0.9, Math.min(0.9, focus.lat * 0.6)) - phi) * 0.045; }
    else if (!drag && !reduce) { lam += vLam; if (Math.abs(vLam) > 0.0036) vLam *= 0.96; else vLam = 0.0035; }
    const S = dpr, cx = (W / 2) * S, cy = (H / 2) * S, r = R * S;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    let g = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.32);
    g.addColorStop(0, "rgba(50,185,214,.28)"); g.addColorStop(0.45, "rgba(123,92,255,.08)"); g.addColorStop(1, "rgba(50,185,214,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.32, 0, 7); ctx.fill();
    g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, "#10285a"); g.addColorStop(0.6, "#091535"); g.addColorStop(1, "#040a1c");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    const sp0 = Math.sin(phi), cp0 = Math.cos(phi);
    const proj = (la, lo) => { const c = Math.cos(la), d = lo - lam; return { x: c * Math.sin(d), y: cp0 * Math.sin(la) - sp0 * c * Math.cos(d), z: sp0 * Math.sin(la) + cp0 * c * Math.cos(d) }; };
    ctx.lineWidth = Math.max(1, S * 0.6); ctx.strokeStyle = "rgba(120,160,255,.10)";
    for (let la = -60; la <= 60; la += 30) { ctx.beginPath(); let st = false; for (let lo = -180; lo <= 180; lo += 4) { const p = proj((la * Math.PI) / 180, (lo * Math.PI) / 180); if (p.z > 0) { if (!st) { ctx.moveTo(cx + r * p.x, cy - r * p.y); st = true; } else ctx.lineTo(cx + r * p.x, cy - r * p.y); } else st = false; } ctx.stroke(); }
    for (let lo = -180; lo < 180; lo += 30) { ctx.beginPath(); let st = false; for (let la = -88; la <= 88; la += 4) { const p = proj((la * Math.PI) / 180, (lo * Math.PI) / 180); if (p.z > 0) { if (!st) { ctx.moveTo(cx + r * p.x, cy - r * p.y); st = true; } else ctx.lineTo(cx + r * p.x, cy - r * p.y); } else st = false; } ctx.stroke(); }
    const pulse = 0.5 + 0.5 * Math.sin(now / 700), base = Math.max(1.1, r / 230), lit = [];
    for (let i = 0; i < N; i++) {
      const d = DLon[i] - lam, cd = Math.cos(d), z = sp0 * sinP[i] + cp0 * cosP[i] * cd;
      if (z <= 0.02) continue;
      const x = cosP[i] * Math.sin(d), y = cp0 * sinP[i] - sp0 * cosP[i] * cd, px = cx + r * x, py = cy - r * y;
      const lv = level[DCC[i]];
      if (lv) lit.push(px, py, z, lv);
      else { ctx.fillStyle = `rgba(120,165,255,${(0.14 + 0.5 * z * z).toFixed(3)})`; const s = base * (0.55 + 0.45 * z); ctx.fillRect(px - s / 2, py - s / 2, s, s); }
    }
    for (let k = 0; k < lit.length; k += 4) { const zz = lit[k + 2], lv = lit[k + 3], s = base * (0.9 + 0.9 * zz) * (0.9 + 0.25 * lv);
      ctx.fillStyle = `rgba(50,185,214,${(0.12 * lv * zz).toFixed(3)})`; ctx.beginPath(); ctx.arc(lit[k], lit[k + 1], s * 2.6, 0, 7); ctx.fill(); }
    for (let k = 0; k < lit.length; k += 4) { const zz = lit[k + 2], lv = lit[k + 3], s = base * (0.9 + 0.9 * zz) * (0.9 + 0.25 * lv);
      ctx.fillStyle = `rgba(${Math.round(90 + 21 * lv)},${Math.round(160 + 67 * lv)},${Math.round(255 - 8 * lv)},${(0.55 + 0.45 * zz).toFixed(3)})`; ctx.beginPath(); ctx.arc(lit[k], lit[k + 1], s * 0.62, 0, 7); ctx.fill(); }
    g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.55, cx, cy, r * 1.02);
    g.addColorStop(0, "rgba(4,10,28,0)"); g.addColorStop(1, "rgba(4,10,28,.55)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    Object.keys(data.occ).forEach((cc) => {
      const c = GLD.C[cc]; if (!c) return;
      const p = proj((c[0] * Math.PI) / 180, (c[1] * Math.PI) / 180); if (p.z <= 0.05) return;
      const X = cx + r * p.x, Y = cy - r * p.y;
      ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.beginPath(); ctx.arc(X, Y, base * 1.5, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(243,183,71,${(0.75 - 0.5 * pulse).toFixed(3)})`; ctx.lineWidth = S * 1.3; ctx.beginPath(); ctx.arc(X, Y, base * (3 + 5 * pulse), 0, 7); ctx.stroke();
    });
    rings = rings.filter((q) => now - q.t0 < 3200);
    rings.forEach((q) => {
      const p = proj(q.lat, q.lon); if (p.z <= 0.02) return;
      const tt0 = (now - q.t0) / 3200, X = cx + r * p.x, Y = cy - r * p.y;
      for (let j = 0; j < 3; j++) { const tt = tt0 - j * 0.16; if (tt <= 0 || tt >= 1) continue;
        ctx.strokeStyle = `rgba(243,183,71,${((1 - tt) * 0.9).toFixed(3)})`; ctx.lineWidth = S * (2 - tt);
        ctx.beginPath(); ctx.ellipse(X, Y, r * 0.16 * tt * (0.4 + p.z * 0.6), r * 0.16 * tt * (0.4 + p.z * 0.6) * (0.45 + 0.55 * p.z), 0, 0, 7); ctx.stroke(); }
      const h = r * 0.2 * Math.min(1, tt0 * 5) * (1 - Math.max(0, tt0 - 0.7) / 0.3);
      const gg = ctx.createLinearGradient(X, Y, X, Y - h); gg.addColorStop(0, "rgba(243,183,71,.95)"); gg.addColorStop(1, "rgba(243,183,71,0)");
      ctx.strokeStyle = gg; ctx.lineWidth = S * 2; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, Y - h); ctx.stroke();
      if (tt0 < 0.8) { ctx.font = `600 ${Math.round(11 * S)}px Consolas, monospace`; ctx.textAlign = "center"; ctx.fillStyle = `rgba(255,236,200,${(1 - tt0 / 0.8).toFixed(3)})`; ctx.fillText(q.cc, X, Y - h - 6 * S); }
    });
    g = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.035);
    g.addColorStop(0, "rgba(111,227,247,0)"); g.addColorStop(0.55, "rgba(111,227,247,.5)"); g.addColorStop(1, "rgba(111,227,247,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.035, 0, 7); ctx.fill();
    raf = requestAnimationFrame(draw);
  }
  const onResize = () => resize();
  window.addEventListener("resize", onResize);
  resize();
  const feedTimer = setInterval(() => { if (visible) renderFeed(); }, 1000);
  raf = requestAnimationFrame(draw);
  return {
    apply,
    get visible() { return visible; },
    setVisible(v) { visible = v; },
    destroy() { dead = true; cancelAnimationFrame(raf); clearInterval(feedTimer); window.removeEventListener("resize", onResize); },
  };
}
