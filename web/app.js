// LunariumCoin Explorer — site (sem framework, sem build). Rotas: /, /blocks, /block/:id, /tx/:id,
// /address/:a, /masternodes, /richlist, /network, /movement, /supply, /charts, /mempool, /api-docs.
import { startSpace } from "./space.js";
import { icons } from "./art.js";
import { t, setLang, lang, intlTag, LANGS, initLang } from "./i18n.js";
import { flagOf, countryFlag } from "./flags.js";
import qrcode from "./qrcode.mjs";
import { startVisits, trackView, visitorsHtml, mountVisitors } from "./visitors.js";

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");

// ---------------- utilidades ----------------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path) {
  const r = await fetch("/api/v1/" + path, { headers: { accept: "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || "HTTP " + r.status); e.status = r.status; throw e; }
  return j;
}

function nf(n, max = 2, min = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat(intlTag(), { maximumFractionDigits: max, minimumFractionDigits: min }).format(n);
}
function compact(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat(intlTag(), { notation: "compact", maximumFractionDigits: 2 }).format(n);
}
// Valor em XLN vindo da API como texto ("123.45000000"): agrupa a parte inteira sem perder precisão.
function amount(str, { unit = true, maxDec = 8, sign = false } = {}) {
  if (str === null || str === undefined) return "—";
  let s = String(str);
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const [i, d = ""] = s.split(".");
  const intPart = new Intl.NumberFormat(intlTag()).format(BigInt(i || "0"));
  let dec = d.slice(0, maxDec).replace(/0+$/, "");
  const sep = new Intl.NumberFormat(intlTag()).format(1.5).charAt(1);
  const pre = neg ? "−" : sign ? "+" : "";
  return `<span class="amount">${pre}${intPart}${dec ? `<span class="dec">${sep}${dec}</span>` : ""}${unit ? '<span class="unit">XLN</span>' : ""}</span>`;
}
function usd(n, digits) {
  if (n === null || n === undefined) return "—";
  const d = digits ?? (n < 0.01 ? 7 : 2);
  return new Intl.NumberFormat(intlTag(), { style: "currency", currency: "USD", maximumFractionDigits: d, minimumFractionDigits: Math.min(2, d) }).format(n);
}
function ago(ts) {
  if (!ts) return "—";
  const s = Math.round(Date.now() / 1000 - ts);
  const rtf = new Intl.RelativeTimeFormat(intlTag(), { numeric: "auto", style: "short" });
  if (Math.abs(s) < 60) return rtf.format(-s, "second");
  if (Math.abs(s) < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (Math.abs(s) < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  if (Math.abs(s) < 86400 * 45) return rtf.format(-Math.round(s / 86400), "day");
  if (Math.abs(s) < 86400 * 365) return rtf.format(-Math.round(s / (86400 * 30.4)), "month");
  return rtf.format(-Math.round(s / (86400 * 365.25)), "year");
}
const date = (ts) => (ts ? new Date(ts * 1000).toLocaleString(intlTag(), { dateStyle: "medium", timeStyle: "short" }) : "—");
const short = (h, n = 10) => (h && h.length > n * 2 + 1 ? `${h.slice(0, n)}…${h.slice(-n)}` : h || "");
const dur = (sec) => {
  if (!sec) return "—";
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}${t("unitD")} ${h}${t("unitH")}` : h ? `${h}${t("unitH")} ${m}${t("unitM")}` : `${m}${t("unitM")}`;
};
const flag = (cc) => countryFlag(cc);
const regionName = (cc) => { try { return new Intl.DisplayNames([intlTag().split("-u-")[0]], { type: "region" }).of(cc) || cc; } catch { return cc; } };
const kindPill = (k) => ({ coinstake: `<span class="pill stake">${t("kStake")}</span>`, coinbase: `<span class="pill coinbase">${t("kCoinbase")}</span>` }[k] || `<span class="pill">${t("kTransfer")}</span>`);
const copyBtn = (text) => `<button class="copy" data-copy="${esc(text)}" title="${esc(t("copy"))}" aria-label="${esc(t("copy"))}">${icons.copy}</button>`;
// Apelidos (alias): carregados uma vez e atualizados depois de um registro.
let NAMES = {};
async function loadNames() { try { NAMES = (await api("names")).names || {}; } catch {} }
const aliasBadge = (v) => (v.official ? `<span class="alias-ok" title="${esc(t("aliasOfficial"))}">${icons.check}</span>` : "");
const addrLink = (a, n = 12) => {
  if (!a) return `<span class="soft">${t("noAddress")}</span>`;
  const v = NAMES[a];
  if (v) return `<a class="alias" href="/address/${esc(a)}" data-link title="${esc(a)}">${esc(v.name)}${aliasBadge(v)}</a>`;
  return `<a class="hash" href="/address/${esc(a)}" data-link title="${esc(a)}">${esc(short(a, n))}</a>`;
};
const txLink = (id, n = 10) => `<a class="hash" href="/tx/${esc(id)}" data-link title="${esc(id)}">${esc(short(id, n))}</a>`;
const blockLink = (h) => `<a href="/block/${h}" data-link>${nf(h, 0)}</a>`;

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("on"), 1600);
}

function loading() { return `<div class="loading"><div class="orbit"></div><div>${t("loading")}</div></div>`; }

function errorView(e) {
  const nf404 = e && e.status === 404;
  return `<div class="empty-state page-enter"><h1>${nf404 ? "404" : "!"}</h1><h2>${esc(nf404 ? t("notFound") : t("errorTitle"))}</h2><p>${esc(nf404 ? t("notFoundHint") : e?.message || "")}</p><p><a class="btn" href="/" data-link>${t("backHome")}</a></p></div>`;
}

// ---------------- gráficos (SVG feitos à mão, com dica ao passar o mouse) ----------------
function lineChart(rows, { y, label, fmt = (v) => nf(v), height = 220, alt = false, xLabel = (r) => r.day }) {
  if (!rows.length) return `<div class="soft card-pad">${t("noData")}</div>`;
  const W = 720, H = height, P = { l: 52, r: 12, t: 14, b: 26 };
  const vals = rows.map((r) => Number(y(r)) || 0);
  let max = Math.max(...vals), min = Math.min(0, ...vals);
  if (max === min) max = min + 1;
  const nice = Math.pow(10, Math.floor(Math.log10(max - min)));
  max = Math.ceil(max / nice) * nice;
  const X = (i) => P.l + (rows.length === 1 ? 0 : (i / (rows.length - 1)) * (W - P.l - P.r));
  const Y = (v) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = min + (max - min) * f;
    return `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 8}" y="${Y(v) + 4}" text-anchor="end">${esc(compact(v))}</text>`;
  });
  const step = Math.max(1, Math.ceil(rows.length / 6));
  const xt = rows.map((r, i) => (i % step === 0 || i === rows.length - 1 ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(xLabel(r).slice(5))}</text>` : "")).join("");
  const id = "g" + Math.random().toString(36).slice(2, 8);
  const color = alt ? "var(--chart-2)" : "var(--chart-1)";
  const data = encodeURIComponent(JSON.stringify(rows.map((r, i) => ({ x: X(i), y: Y(vals[i]), l: xLabel(r), v: fmt(vals[i]) }))));
  return `<div class="chart" data-chart="${data}" data-label="${esc(label)}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${alt ? "#b8862a" : "#1fa3c2"}" stop-opacity=".35"/><stop offset="1" stop-color="${alt ? "#b8862a" : "#1fa3c2"}" stop-opacity="0"/></linearGradient></defs>
      <g class="grid axis">${grid.join("")}</g><g class="axis">${xt}</g>
      <path d="M${pts[0]} L${pts.join(" L")} L${X(rows.length - 1)},${Y(min)} L${X(0)},${Y(min)} Z" fill="url(#${id})"/>
      <polyline class="series${alt ? " alt" : ""}" points="${pts.join(" ")}" style="stroke:${color}"/>
      <line class="cross" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" visibility="hidden"/>
      <circle class="dot" r="5" cx="0" cy="0" visibility="hidden" style="fill:${color}"/>
      <rect class="hit" x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent"/>
    </svg><div class="tip"></div></div>`;
}

function wireCharts(root) {
  root.querySelectorAll(".chart[data-chart]").forEach((box) => {
    const pts = JSON.parse(decodeURIComponent(box.dataset.chart));
    const svg = box.querySelector("svg"), cross = svg.querySelector(".cross"), dot = svg.querySelector(".dot"), tip = box.querySelector(".tip"), hit = svg.querySelector(".hit");
    const vb = svg.viewBox.baseVal;
    function move(ev) {
      const r = svg.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * vb.width;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
      cross.setAttribute("x1", best.x); cross.setAttribute("x2", best.x); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", best.x); dot.setAttribute("cy", best.y); dot.setAttribute("visibility", "visible");
      tip.innerHTML = `<span class="soft">${esc(best.l)}</span><b>${esc(best.v)}</b>`;
      tip.style.left = (best.x / vb.width) * r.width + 14 + "px";
      tip.style.top = (best.y / vb.height) * r.height + 10 + "px";
      tip.classList.add("on");
    }
    function out() { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.classList.remove("on"); }
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerleave", out);
  });
}

function qrSvg(text) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR"><path d="${d}" fill="#06101f"/></svg>`;
}

// ---------------- páginas ----------------
let liveHandler = null; // a página atual recebe os eventos de bloco novo por aqui
let pageCleanup = null; // desliga animações/timers da página ao sair dela
let firstRender = true;

function statTiles(s) {
  const p = s.price;
  const ch = p?.change24h;
  const mn = s.masternodes;
  return `
  <div class="stats">
    <div class="stat"><div class="label">${icons.cube}${t("sHeight")}</div><div class="value" data-live="height">${nf(s.height, 0)}</div><div class="sub" data-live="age">${t("lastBlock")} ${ago(s.time)}</div></div>
    <div class="stat gold"><div class="label">${icons.coins}${t("sSupply")}</div><div class="value">${amount(s.supply, { maxDec: 0 })}</div><div class="sub">${t("sAudited")}</div></div>
    <div class="stat gold"><div class="label">${icons.dollar}${t("sPrice")}</div><div class="value">${p ? usd(p.usd) : "—"}</div><div class="sub">${p ? `<span class="${ch >= 0 ? "up" : "down"}">${ch >= 0 ? "▲" : "▼"} ${nf(Math.abs(ch), 2)}%</span> · ${t("mcap")} ${usd(p.marketCapUsd, 0)}` : t("noPrice")}</div></div>
    <div class="stat"><div class="label">${icons.server}${t("sMasternodes")}</div><div class="value">${mn ? nf(mn.enabled, 0) : "—"}</div><div class="sub">${mn ? `IPv4 ${mn.ipv4} · IPv6 ${mn.ipv6}${mn.onion ? ` · Tor ${mn.onion}` : ""}` : ""}</div></div>
    <div class="stat"><div class="label">${icons.gauge}${t("sDifficulty")}</div><div class="value">${nf(s.difficulty, 2)}</div><div class="sub">${t("sHashrate")} ${s.hashrate ? compact(s.hashrate) + "H/s" : "—"}</div></div>
    <div class="stat"><div class="label">${icons.clock}${t("sBlockTime")}</div><div class="value">${s.avgBlockTime ? nf(s.avgBlockTime, 1) + " s" : "—"}</div><div class="sub">${t("sTarget")}</div></div>
    <div class="stat"><div class="label">${icons.swap}${t("sTx24h")}</div><div class="value">${nf(s.txs24h, 0)}</div><div class="sub">${t("volume")} ${amount(s.volume24h, { maxDec: 0 })}</div></div>
    <div class="stat"><div class="label">${icons.users}${t("sAddresses")}</div><div class="value">${nf(s.addressesWithBalance, 0)}</div><div class="sub">${t("sConnections")}: ${s.connections ?? "—"} · ${t("mempool")}: ${s.mempool}</div></div>
  </div>`;
}

function auditBanner(s) {
  const ok = s.auditViolations === 0;
  return `<div class="audit-banner ${ok ? "" : "bad"}">
    <div class="ico">${icons.shield}</div>
    <div><strong>${ok ? t("auditOkTitle") : t("auditBadTitle", { n: s.auditViolations })}</strong><span>${t("auditOkText", { h: nf(s.height, 0) })}</span></div>
    <a href="/supply" data-link>${t("seeAudit")} →</a>
  </div>`;
}

function blocksTable(list, { compactCols = false } = {}) {
  return `<div class="table-wrap"><table><thead><tr>
    <th>${t("block")}</th><th class="hide-sm">${t("age")}</th><th>${t("type")}</th><th class="num">${t("txs")}</th>${compactCols ? "" : `<th class="hide-sm">${t("generatedBy")}</th><th class="hide-sm">${t("masternode")}</th>`}<th class="num">${t("reward")}</th>
  </tr></thead><tbody>${list.map((b) => blockRow(b, compactCols)).join("")}</tbody></table></div>`;
}
function blockRow(b, compactCols, isNew = false) {
  return `<tr${isNew ? ' class="row-new"' : ""} data-h="${b.height}">
    <td><span class="blocknum"><span class="cube">${icons.cube}</span>${blockLink(b.height)}</span></td>
    <td class="hide-sm muted">${ago(b.time)}</td>
    <td><span class="pill ${b.kind}">${b.kind === "pos" ? "PoS" : "PoW"}</span></td>
    <td class="num">${b.txCount}</td>
    ${compactCols ? "" : `<td class="hide-sm">${addrLink(b.staker, 8)}</td><td class="hide-sm">${addrLink(b.masternode, 8)}</td>`}
    <td class="num">${amount(b.minted)}</td></tr>`;
}
function txRows(list, isNew = false) {
  return list.map((x) => `<tr${isNew ? ' class="row-new"' : ""}><td>${txLink(x.txid, 8)}</td><td>${kindPill(x.kind)}</td><td class="hide-sm muted">${ago(x.time)}</td><td class="num">${amount(x.value)}</td></tr>`).join("");
}

// Astronauta da abertura da carteira V5 (garimpo.mp4): só o trecho final, diante da logo, com o código
// refletido no capacete. Toca em loop com uma passagem suave; no celular, com economia de dados ou para quem
// prefere menos movimento, fica só a imagem de capa (último quadro).
const HERO_LOOP = { start: 11.5, end: 19.9 };
function heroVideoHtml() {
  return `<div class="hero-video">
    <img class="hv-poster" src="/assets/astronaut-poster.jpg" alt="${esc(t("heroArtAlt"))}" width="848" height="478"/>
    <video class="hv-video" muted playsinline preload="none" poster="/assets/astronaut-poster.jpg" aria-hidden="true" tabindex="-1"></video>
    <span class="hv-ring" aria-hidden="true"></span>
  </div>`;
}
function mountHeroVideo(root) {
  const box = root.querySelector(".hero-video");
  const v = box?.querySelector("video");
  if (!v) return () => {};
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = matchMedia("(max-width: 680px)").matches;
  const saveData = navigator.connection?.saveData;
  if (reduce || small || saveData) return () => {};
  let stopped = false;
  v.src = "/assets/astronaut.mp4#t=" + HERO_LOOP.start;
  v.preload = "auto";
  const onMeta = () => { v.currentTime = HERO_LOOP.start; v.play().catch(() => {}); };
  const onPlaying = () => box.classList.add("playing");
  const onTime = () => {
    if (stopped) return;
    if (v.currentTime >= HERO_LOOP.end - 0.6) box.classList.add("fading");
    if (v.currentTime >= HERO_LOOP.end) {
      v.currentTime = HERO_LOOP.start;
      setTimeout(() => box.classList.remove("fading"), 120);
    }
  };
  const onVis = () => { if (document.hidden) v.pause(); else if (!stopped) v.play().catch(() => {}); };
  v.addEventListener("loadedmetadata", onMeta, { once: true });
  v.addEventListener("playing", onPlaying);
  v.addEventListener("timeupdate", onTime);
  document.addEventListener("visibilitychange", onVis);
  return () => {
    stopped = true;
    v.pause();
    v.removeAttribute("src");
    v.load();
    document.removeEventListener("visibilitychange", onVis);
  };
}

async function pageHome() {
  const [s, blocks, txs, charts] = await Promise.all([api("stats"), api("blocks?limit=10"), api("txs?limit=10"), api("charts?days=30").catch(() => [])]);
  document.title = `LunariumCoin Explorer — ${t("tagline")}`;
  app.innerHTML = `<div class="page-enter">
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow"><span class="live-dot"></span>${t("heroEyebrow")}</span>
        <h1>${t("heroTitleA")} <span class="grad">${t("heroTitleB")}</span></h1>
        <p class="lead">${t("heroLead")}</p>
        <form class="search big" data-search role="search"><input type="search" name="q" placeholder="${esc(t("searchPlaceholder"))}" autocomplete="off" spellcheck="false"/><button type="submit">${icons.arrow}<span>${t("search")}</span></button></form>
        <div class="hero-hints"><span>${t("hintBlock")}</span><span>${t("hintTx")}</span><span>${t("hintAddress")}</span></div>
      </div>
      <div class="hero-art">${heroVideoHtml()}</div>
    </section>
    <div id="statsBox">${statTiles(s)}</div>
    ${auditBanner(s)}
    <div class="grid-2">
      <section class="card"><div class="card-head"><h2>${icons.cube}${t("latestBlocks")}</h2><a class="more" href="/blocks" data-link>${t("seeAll")} ${icons.arrow}</a></div><div id="homeBlocks">${blocksTable(blocks, { compactCols: true })}</div></section>
      <section class="card"><div class="card-head"><h2>${icons.swap}${t("latestTxs")}</h2><a class="more" href="/movement" data-link>${t("bigMoves")} ${icons.arrow}</a></div>
        <div class="table-wrap"><table><thead><tr><th>${t("transaction")}</th><th>${t("type")}</th><th class="hide-sm">${t("age")}</th><th class="num">${t("value")}</th></tr></thead><tbody id="homeTxs">${txRows(txs)}</tbody></table></div></section>
    </div>
    <section class="card" style="margin-top:18px"><div class="card-head"><h2>${icons.chart}${t("txPerDay")}</h2><a class="more" href="/charts" data-link>${t("allCharts")} ${icons.arrow}</a></div>
      ${lineChart(charts, { y: (r) => r.txs, label: t("txPerDay"), fmt: (v) => nf(v, 0) + " " + t("txs") })}</section>
    ${visitorsHtml()}
  </div>`;
  wireCharts(app);
  const stopVisitors = mountVisitors(app);
  const stopVideo = mountHeroVideo(app);
  pageCleanup = () => { stopVisitors(); stopVideo(); };
  liveHandler = (ev) => {
    const box = $("#statsBox");
    if (box) box.innerHTML = statTiles(ev.stats);
    const tb = $("#homeBlocks tbody");
    if (tb) {
      const known = new Set([...tb.querySelectorAll("tr")].map((r) => Number(r.dataset.h)));
      const fresh = ev.blocks.filter((b) => !known.has(b.height)).reverse();
      for (const b of fresh) tb.insertAdjacentHTML("afterbegin", blockRow(b, true, true));
      while (tb.children.length > 10) tb.lastElementChild.remove();
    }
    const tx = $("#homeTxs");
    if (tx) tx.innerHTML = txRows(ev.txs.slice(0, 10));
  };
}

async function pageBlocks(params, query) {
  const before = query.get("before");
  const list = await api(`blocks?limit=25${before ? `&before=${encodeURIComponent(before)}` : ""}`);
  document.title = `${t("blocks")} — LunariumCoin Explorer`;
  const last = list[list.length - 1];
  app.innerHTML = `<div class="page-enter">
    ${title(icons.layers, t("blocks"), t("blocksSub"))}
    <section class="card">${blocksTable(list)}
      <div class="pager">${before ? `<a class="btn" href="/blocks" data-link>${t("newest")}</a>` : ""}${last && last.height > 0 ? `<a class="btn" href="/blocks?before=${last.height - 1}" data-link>${t("older")} →</a>` : ""}</div></section></div>`;
  if (!before) liveHandler = (ev) => {
    const tb = app.querySelector("tbody");
    if (!tb) return;
    const known = new Set([...tb.querySelectorAll("tr")].map((r) => Number(r.dataset.h)));
    for (const b of ev.blocks.filter((b) => !known.has(b.height)).reverse()) tb.insertAdjacentHTML("afterbegin", blockRow(b, false, true));
    while (tb.children.length > 25) tb.lastElementChild.remove();
  };
}

function title(icon, h, sub) {
  return `<div class="page-title"><div class="icon-orb">${icon}</div><div><h1>${h}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div></div>`;
}

async function pageBlock({ id }) {
  const b = await api("block/" + encodeURIComponent(id));
  document.title = `${t("block")} ${b.height} — LunariumCoin Explorer`;
  app.innerHTML = `<div class="page-enter">
    ${title(icons.cube, `${t("block")} #${nf(b.height, 0)}`, `<span class="hash">${esc(b.hash)}</span> ${copyBtn(b.hash)}`)}
    <div class="pager" style="justify-content:flex-start;padding:0 0 14px">
      ${b.height > 0 ? `<a class="btn" href="/block/${b.height - 1}" data-link>← ${t("prevBlock")}</a>` : ""}
      ${b.next ? `<a class="btn" href="/block/${b.height + 1}" data-link>${t("nextBlock")} →</a>` : ""}
    </div>
    <section class="card"><div class="kv">
      <div class="k">${t("time")}</div><div class="v">${date(b.time)} <span class="soft">(${ago(b.time)})</span></div>
      <div class="k">${t("confirmations")}</div><div class="v">${nf(b.confirmations, 0)}</div>
      <div class="k">${t("type")}</div><div class="v"><span class="pill ${b.kind}">${b.kind === "pos" ? t("proofStake") : t("proofWork")}</span></div>
      <div class="k">${t("generatedBy")}</div><div class="v">${addrLink(b.staker, 40)}</div>
      <div class="k">${t("masternodePaid")}</div><div class="v">${b.masternode ? `${addrLink(b.masternode, 40)} · ${amount(b.masternodeReward)}` : "—"}</div>
      <div class="k">${t("minted")}</div><div class="v">${amount(b.minted)}</div>
      <div class="k">${t("fees")}</div><div class="v">${amount(b.fees)}</div>
      <div class="k">${t("totalMoved")}</div><div class="v">${amount(b.outTotal)}</div>
      <div class="k">${t("size")}</div><div class="v">${nf(b.size, 0)} bytes</div>
      <div class="k">${t("difficulty")}</div><div class="v">${nf(b.difficulty, 4)}</div>
      <div class="k">Merkle root</div><div class="v hash">${esc(b.merkleroot)}</div>
      <div class="k">${t("prevBlock")}</div><div class="v">${b.previous ? `<a class="hash" href="/block/${b.previous}" data-link>${esc(b.previous)}</a>` : "—"}</div>
      <div class="k">${t("nextBlock")}</div><div class="v">${b.next ? `<a class="hash" href="/block/${b.next}" data-link>${esc(b.next)}</a>` : `<span class="soft">${t("waitingNext")}</span>`}</div>
      <div class="k">Bits · Nonce · ${t("version")}</div><div class="v hash">${esc(b.bits)} · ${b.nonce} · ${b.version}</div>
    </div></section>
    <section class="card" style="margin-top:18px"><div class="card-head"><h2>${icons.swap}${t("transactions")} (${b.txs.length})</h2></div>
      <div class="table-wrap"><table><thead><tr><th>${t("transaction")}</th><th>${t("type")}</th><th class="num hide-sm">${t("inputsOutputs")}</th><th class="num">${t("value")}</th></tr></thead>
      <tbody>${b.txs.map((x) => `<tr><td>${txLink(x.txid, 14)}</td><td>${kindPill(x.kind)}</td><td class="num hide-sm">${x.inputs} → ${x.outputs}</td><td class="num">${amount(x.valueOut)}</td></tr>`).join("")}</tbody></table></div></section>
  </div>`;
}

async function pageTx({ id }) {
  const x = await api("tx/" + encodeURIComponent(id));
  document.title = `${t("transaction")} ${short(x.txid, 6)} — LunariumCoin Explorer`;
  const ins = x.kind === "coinbase"
    ? `<div class="io"><div class="who"><span class="pill coinbase">${t("newCoins")}</span><div class="meta">${t("coinbaseHint")}</div></div><div>${amount(x.valueOut)}</div></div>`
    : x.inputs.map((i) => `<div class="io"><div class="who">${addrLink(i.address, 40)}<div class="meta">${txLink(i.txid, 8)}:${i.vout}</div></div><div>${amount(i.value)}</div></div>`).join("") || `<div class="io empty">—</div>`;
  const outs = x.outputs.map((o) => {
    if (!o.address && o.value === "0.00000000" && o.type === "nonstandard") return `<div class="io"><div class="who"><span class="soft">${t("stakeMarker")}</span></div><div class="soft">0</div></div>`;
    const spent = o.spentBy ? `<div class="meta">${t("spentIn")} ${txLink(o.spentBy, 8)}</div>` : x.confirmed ? `<div class="meta"><span class="up">●</span> ${t("unspent")}</div>` : "";
    return `<div class="io"><div class="who">${o.address ? addrLink(o.address, 40) : `<span class="soft">${esc(o.type || "")}</span>`}${spent}</div><div>${amount(o.value)}</div></div>`;
  }).join("");
  const status = x.confirmed ? `<span class="pill ok">${t("confirmedN", { n: nf(x.confirmations, 0) })}</span>` : `<span class="pill warn">${t("unconfirmed")}</span>`;
  app.innerHTML = `<div class="page-enter">
    ${title(icons.swap, t("transaction"), `<span class="hash">${esc(x.txid)}</span> ${copyBtn(x.txid)}`)}
    <section class="card"><div class="kv">
      <div class="k">${t("status")}</div><div class="v">${status} ${kindPill(x.kind)}</div>
      <div class="k">${t("block")}</div><div class="v">${x.height !== null ? `${blockLink(x.height)} <span class="soft">· ${date(x.time)} (${ago(x.time)})</span>` : `<span class="soft">${t("inMempool")}</span>`}</div>
      <div class="k">${t("totalOut")}</div><div class="v">${amount(x.valueOut)}</div>
      ${x.kind === "normal" ? `<div class="k">${t("fee")}</div><div class="v">${x.fee !== null ? amount(x.fee) : "—"}</div>` : `<div class="k">${t("minted")}</div><div class="v">${amount(x.minted)}</div>`}
      <div class="k">${t("size")}</div><div class="v">${x.size ? nf(x.size, 0) + " bytes" : "—"}</div>
      ${x.opReturn ? `<div class="k">OP_RETURN</div><div class="v hash">${esc(x.opReturn)}</div>` : ""}
    </div></section>
    <section class="card" style="margin-top:18px"><div class="card-head"><h2>${icons.arrow}${t("flow")}</h2><span class="soft">${x.inputs.length || (x.kind === "coinbase" ? 1 : 0)} → ${x.outputs.length}</span></div>
      <div class="flow"><div class="side">${ins}</div><div class="arrow">${icons.arrow}</div><div class="side">${outs}</div></div></section>
  </div>`;
}

async function pageAddress({ id }, query) {
  let a;
  try { a = await api("address/" + encodeURIComponent(id)); }
  catch (e) {
    if (e.status !== 404) throw e;
    const s = await api("search?q=" + encodeURIComponent(id)).catch(() => null);
    if (s && s.type === "address" && s.id !== id) return go("/address/" + s.id, true);
    document.title = `${t("address")} — LunariumCoin Explorer`;
    if (!s) {
      app.innerHTML = `<div class="empty-state page-enter"><h1>?</h1><h2>${t("addrInvalid")}</h2><p class="hash">${esc(id)}</p><p>${t("notFoundHint")}</p><p><a class="btn" href="/" data-link>${t("backHome")}</a></p></div>`;
      return;
    }
    app.innerHTML = `<div class="page-enter">${title(icons.users, t("address"), `<span class="hash">${esc(id)}</span>`)}
      <section class="card addr-hero"><div><div class="soft">${t("balance")}</div><div class="balance">0<span class="unit">XLN</span></div><div class="muted">${s ? t("addrNoTx") : t("addrInvalid")}</div></div>${s ? `<div class="qr">${qrSvg(id)}</div>` : ""}</section></div>`;
    return;
  }
  if (a.address !== id) return go("/address/" + a.address, true);
  document.title = `${t("address")} ${short(a.address, 6)} — LunariumCoin Explorer`;
  const offset = Math.max(0, Number(query.get("offset")) || 0);
  const h = await api(`address/${a.address}/txs?offset=${offset}&limit=25`);
  const mn = a.masternodes.length;
  app.innerHTML = `<div class="page-enter">
    ${title(icons.users,
      a.alias ? `${esc(a.alias.name)} ${a.alias.official ? `<span class="pill ok">${icons.check} ${t("aliasOfficial")}</span>` : `<span class="pill">${t("aliasClaimed")}</span>`}` : t("address"),
      `<span class="hash">${esc(a.address)}</span> ${copyBtn(a.address)}${a.alias?.official ? "" : ` <a class="btn btn-sm" href="/claim?address=${esc(a.address)}" data-link>${icons.tag} ${a.alias ? t("changeAlias") : t("setAlias")}</a>`}${a.legacy ? `<div class="soft" style="font-size:12.5px;margin-top:4px">${t("legacyForm")}: <span class="hash">${esc(a.legacy)}</span></div>` : ""}`)}
    <section class="card addr-hero">
      <div>
        <div class="soft">${t("balance")} ${a.rank ? `<span class="pill" style="margin-inline-start:8px">#${nf(a.rank, 0)} ${t("richRank")}</span>` : ""} ${mn ? `<span class="pill mn">${icons.server} ${t("masternodeN", { n: mn })}</span>` : ""}</div>
        <div class="balance">${amount(a.balance, { unit: false })}<span class="unit">XLN</span></div>
        <div class="grid-3" style="margin-top:14px">
          <div><div class="soft">${t("received")}</div><div>${amount(a.received)}</div></div>
          <div><div class="soft">${t("sent")}</div><div>${amount(a.sent)}</div></div>
          <div><div class="soft">${t("transactions")}</div><div class="amount">${nf(a.txCount, 0)}</div></div>
        </div>
      </div>
      <div class="qr" title="${esc(a.address)}">${qrSvg(a.address)}</div>
    </section>
    <div class="grid-2" style="margin-top:18px">
      <section class="card card-pad"><div class="soft">${icons.server} ${t("mnRewards")}</div><div style="font-size:20px;margin-top:6px">${amount(a.rewards.masternode.total)}</div><div class="soft">${t("rewardsCount", { n: nf(a.rewards.masternode.count, 0) })}${a.rewards.masternode.last ? ` · ${t("last")} ${blockLink(a.rewards.masternode.last)}` : ""}</div></section>
      <section class="card card-pad"><div class="soft">${icons.star} ${t("stakeRewards")}</div><div style="font-size:20px;margin-top:6px">${amount(a.rewards.stake.total)}</div><div class="soft">${t("rewardsCount", { n: nf(a.rewards.stake.count, 0) })}${a.rewards.stake.last ? ` · ${t("last")} ${blockLink(a.rewards.stake.last)}` : ""}</div></section>
    </div>
    ${mn ? `<section class="card" style="margin-top:18px"><div class="card-head"><h2>${icons.server}${t("masternodes")}</h2></div><div class="table-wrap"><table><thead><tr><th>${t("collateral")}</th><th>${t("status")}</th><th class="hide-sm">${t("network")}</th><th class="num">${t("activeTime")}</th><th class="num hide-sm">${t("lastPaid")}</th></tr></thead><tbody>
      ${a.masternodes.map((m) => `<tr><td>${txLink(m.txhash, 8)}:${m.outidx}</td><td><span class="pill ${m.status === "ENABLED" ? "ok" : "warn"}">${esc(m.status)}</span></td><td class="hide-sm">${esc(m.network)}</td><td class="num">${dur(m.activetime)}</td><td class="num hide-sm">${m.lastpaid ? ago(m.lastpaid) : "—"}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
    <section class="card" style="margin-top:18px"><div class="card-head"><h2>${icons.swap}${t("history")}</h2><span class="soft">${nf(h.total, 0)} ${t("txs")}</span></div>
      <div class="table-wrap"><table><thead><tr><th>${t("transaction")}</th><th class="hide-sm">${t("block")}</th><th class="hide-sm">${t("age")}</th><th>${t("type")}</th><th class="num">${t("change")}</th><th class="num hide-sm">${t("balance")}</th></tr></thead><tbody>
      ${h.txs.map((x) => { const pos = !x.delta.startsWith("-"); return `<tr><td>${txLink(x.txid, 8)}</td><td class="hide-sm">${blockLink(x.height)}</td><td class="hide-sm muted">${ago(x.time)}</td><td>${x.kind === "coinstake" ? `<span class="pill stake">${t("kReward")}</span>` : kindPill(x.kind)}</td><td class="num ${pos ? "up" : "down"}">${amount(x.delta, { sign: pos })}</td><td class="num hide-sm">${amount(x.balance)}</td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="pager">${offset > 0 ? `<a class="btn" href="/address/${a.address}?offset=${Math.max(0, offset - 25)}" data-link>← ${t("newer")}</a>` : ""}<span class="soft">${nf(offset + 1, 0)}–${nf(Math.min(h.total, offset + 25), 0)} / ${nf(h.total, 0)}</span>${offset + 25 < h.total ? `<a class="btn" href="/address/${a.address}?offset=${offset + 25}" data-link>${t("older")} →</a>` : ""}</div>
    </section></div>`;
}

async function pageMasternodes(_, query) {
  const d = await api("masternodes");
  document.title = `${t("masternodes")} — LunariumCoin Explorer`;
  const c = d.count || {};
  const filter = (query.get("q") || "").trim().toLowerCase();
  const list = d.list.filter((m) => !filter || m.address.toLowerCase().includes(filter) || m.txhash.includes(filter) || (m.status || "").toLowerCase().includes(filter));
  const versions = {};
  d.list.forEach((m) => { versions[m.version] = (versions[m.version] || 0) + 1; });
  app.innerHTML = `<div class="page-enter">
    ${title(icons.server, t("masternodes"), t("mnSub"))}
    <div class="stats">
      <div class="stat"><div class="label">${icons.server}${t("total")}</div><div class="value">${nf(c.total ?? d.list.length, 0)}</div></div>
      <div class="stat"><div class="label">${icons.pulse}${t("enabled")}</div><div class="value up">${nf(c.enabled ?? c.stable, 0)}</div></div>
      <div class="stat"><div class="label">${icons.globe}IPv4 · IPv6</div><div class="value">${nf(c.ipv4, 0)} · ${nf(c.ipv6, 0)}</div><div class="sub">Tor ${nf(c.onion ?? 0, 0)}</div></div>
      <div class="stat gold"><div class="label">${icons.coins}${t("mnReward")}</div><div class="value">75%</div><div class="sub">${t("mnRewardSub")}</div></div>
    </div>
    <section class="card"><div class="card-head"><h2>${icons.server}${t("mnList")}</h2>
      <form data-filter><input class="field" name="q" value="${esc(filter)}" placeholder="${esc(t("filterMn"))}"/></form></div>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>${t("address")}</th><th>${t("status")}</th><th class="hide-sm">${t("network")}</th><th class="hide-sm">${t("collateral")}</th><th class="num">${t("activeTime")}</th><th class="num">${t("lastPaid")}</th></tr></thead><tbody>
      ${list.map((m, i) => `<tr><td class="soft">${m.rank || i + 1}</td><td>${addrLink(m.address, 10)}</td><td><span class="pill ${m.status === "ENABLED" ? "ok" : "warn"}">${esc(m.status)}</span></td><td class="hide-sm"><span class="pill">${esc(m.network)}</span></td><td class="hide-sm">${txLink(m.txhash, 6)}:${m.outidx}</td><td class="num">${dur(m.activetime)}</td><td class="num muted">${m.lastpaid ? ago(m.lastpaid) : "—"}</td></tr>`).join("") || `<tr><td colspan="7" class="soft">${t("noData")}</td></tr>`}
      </tbody></table></div></section>
    <p class="soft" style="font-size:12.5px;margin-top:10px">${t("updated")} ${d.updated ? ago(d.updated / 1000) : "—"} · ${t("protocols")}: ${Object.entries(versions).map(([v, n]) => `${esc(v)} (${n})`).join(", ")}</p>
  </div>`;
}

async function pageRichlist() {
  const r = await api("richlist");
  document.title = `${t("richlist")} — LunariumCoin Explorer`;
  app.innerHTML = `<div class="page-enter">
    ${title(icons.star, t("richlist"), t("richSub", { s: amount(r.supply, { maxDec: 0 }) }))}
    <section class="card"><div class="card-head"><h2>${icons.chart}${t("distribution")}</h2></div>
      ${r.distribution.map((d) => `<div class="dist-row"><div>${d.to ? `${t("top")} ${d.from}–${d.to}` : `${d.from}+`}</div><div class="dist-bar" title="${nf(d.percent, 2)}%"><span style="width:${Math.max(0.5, d.percent)}%"></span></div><div class="num">${nf(d.percent, 2)}% · ${amount(d.total, { maxDec: 0 })}</div></div>`).join("")}
      <div style="height:10px"></div></section>
    <section class="card" style="margin-top:18px"><div class="table-wrap"><table><thead><tr><th>#</th><th>${t("address")}</th><th class="num">${t("balance")}</th><th class="num hide-sm">%</th><th class="num hide-sm">${t("txs")}</th></tr></thead><tbody>
      ${r.top.map((x) => `<tr><td class="soft">${x.rank}</td><td>${addrLink(x.address, 14)} ${x.masternode ? `<span class="pill mn">MN</span>` : ""}</td><td class="num">${amount(x.balance)}</td><td class="num hide-sm">${nf(x.percent, 2)}%</td><td class="num hide-sm muted">${nf(x.txCount, 0)}</td></tr>`).join("")}
    </tbody></table></div></section></div>`;
}

async function pageNetwork() {
  const [p, s] = await Promise.all([api("peers"), api("stats")]);
  document.title = `${t("network")} — LunariumCoin Explorer`;
  const vers = {};
  p.list.forEach((x) => { const v = (x.subver || "?").replace(/^\/|\/$/g, ""); vers[v] = (vers[v] || 0) + 1; });
  const vlist = Object.entries(vers).sort((a, b) => b[1] - a[1]);
  const maxV = Math.max(1, ...vlist.map((v) => v[1]));
  app.innerHTML = `<div class="page-enter">
    ${title(icons.globe, t("network"), t("networkSub"))}
    <div class="stats">
      <div class="stat"><div class="label">${icons.link}${t("sConnections")}</div><div class="value">${nf(p.list.length, 0)}</div></div>
      <div class="stat"><div class="label">${icons.gauge}${t("sDifficulty")}</div><div class="value">${nf(s.difficulty, 2)}</div></div>
      <div class="stat"><div class="label">${icons.bolt}${t("sHashrate")}</div><div class="value">${s.hashrate ? compact(s.hashrate) + "H/s" : "—"}</div></div>
      <div class="stat"><div class="label">${icons.cube}${t("sHeight")}</div><div class="value">${nf(s.height, 0)}</div></div>
    </div>
    <section class="card"><div class="card-head"><h2>${icons.layers}${t("versions")}</h2></div>
      ${vlist.map(([v, n]) => `<div class="dist-row"><div class="hash" title="${esc(v)}">${esc(v.replace("LunariumCoin Core:", "v"))}</div><div class="dist-bar"><span style="width:${(n / maxV) * 100}%"></span></div><div class="num">${n} ${t(n === 1 ? "peerOne" : "peers")}</div></div>`).join("")}
      <div style="height:10px"></div></section>
    <section class="card" style="margin-top:18px"><div class="card-head"><h2>${icons.globe}${t("connectedPeers")}</h2>
      <div class="seg" role="tablist"><button data-pane-btn="peers" class="on" role="tab">${t("tabConnections")}</button><button data-pane-btn="seeds" role="tab">${t("tabSeeds")}</button></div></div>
      <div data-pane="peers"><div class="table-wrap"><table><thead><tr><th>${t("node")}</th><th class="hide-sm">${t("country")}</th><th>${t("version")}</th><th class="num hide-sm">${t("protocol")}</th><th class="num">${t("height")}</th><th class="num hide-sm">Ping</th></tr></thead><tbody>
      ${p.list.map((x) => `<tr><td class="hash">${esc(x.ip)}</td><td class="hide-sm">${flag(x.country_code)} ${esc(x.country_code ? regionName(x.country_code) : x.country || "—")}</td><td>${esc((x.subver || "").replace(/^\/|\/$/g, ""))}</td><td class="num hide-sm">${x.version}</td><td class="num">${x.synced_blocks > 0 ? nf(x.synced_blocks, 0) : x.startingheight > 0 ? nf(x.startingheight, 0) : "—"}</td><td class="num hide-sm">${x.pingtime ? nf(x.pingtime * 1000, 0) + " ms" : "—"}</td></tr>`).join("")}
      </tbody></table></div></div>
      <div data-pane="seeds" hidden>${seedsHtml(p.list, s.height)}</div></section></div>`;
  app.querySelectorAll("[data-pane-btn]").forEach((b) => b.addEventListener("click", () => {
    app.querySelectorAll("[data-pane-btn]").forEach((x) => x.classList.toggle("on", x === b));
    app.querySelectorAll("[data-pane]").forEach((x) => { x.hidden = x.dataset.pane !== b.dataset.paneBtn; });
  }));
}

// Seeds: nós da versão atual (4.x) que estão na ponta da rede, prontos para o .conf e para o console da carteira.
function seedsHtml(list, tip) {
  const good = list.filter((x) => /Core:4\./.test(x.subver || "") && ((x.synced_blocks > 0 && x.synced_blocks >= tip - 100) || (!(x.synced_blocks > 0) && x.startingheight >= tip - 1440)));
  const hostPort = (x) => (x.ip.includes(":") ? `[${x.ip}]` : x.ip) + ":13990";
  const conf = good.map((x) => `addnode=${hostPort(x)}`).join("\n");
  const onetry = good.map((x) => `addnode ${hostPort(x)} onetry`).join("\n");
  if (!good.length) return `<div class="card-pad soft">${t("noData")}</div>`;
  return `<div class="card-pad seeds">
    <h3>${t("seedsConfTitle")}</h3><p class="muted">${t("seedsConfHelp")}</p>
    <div class="code">${esc(conf)}</div><button class="btn btn-sm" data-copy="${esc(conf)}">${icons.copy} ${t("copyAll")}</button>
    <h3>${t("seedsConsoleTitle")}</h3><p class="muted">${t("seedsConsoleHelp")}</p>
    <div class="code">${esc(onetry)}</div><button class="btn btn-sm" data-copy="${esc(onetry)}">${icons.copy} ${t("copyAll")}</button>
  </div>`;
}

async function pageMovement(_, query) {
  const min = Number(query.get("min") || 1000);
  const list = await api(`movement?min=${min}&limit=60`);
  document.title = `${t("movement")} — LunariumCoin Explorer`;
  const opts = [100, 1000, 10000, 100000, 1000000];
  app.innerHTML = `<div class="page-enter">
    ${title(icons.swap, t("movement"), t("movementSub"))}
    <section class="card"><div class="card-head"><h2>${icons.swap}${t("bigMoves")}</h2>
      <div class="seg">${opts.map((o) => `<button data-min="${o}" class="${o === min ? "on" : ""}">≥ ${compact(o)}</button>`).join("")}</div></div>
      <div class="table-wrap"><table><thead><tr><th>${t("transaction")}</th><th class="hide-sm">${t("block")}</th><th>${t("age")}</th><th class="num hide-sm">${t("recipients")}</th><th class="num">${t("value")}</th></tr></thead><tbody>
      ${list.map((x) => `<tr><td>${txLink(x.txid, 10)}</td><td class="hide-sm">${blockLink(x.height)}</td><td class="muted">${ago(x.time)}</td><td class="num hide-sm">${x.recipients}</td><td class="num">${amount(x.value)}</td></tr>`).join("") || `<tr><td colspan="5" class="soft">${t("noData")}</td></tr>`}
      </tbody></table></div></section></div>`;
  app.querySelectorAll("[data-min]").forEach((b) => b.addEventListener("click", () => go(`/movement?min=${b.dataset.min}`)));
}

const ERAS = [[1, 14400, 1], [14401, 621701, 12], [621702, 2724101, 10], [2724102, 4826501, 5], [4826502, 6928901, 2], [6928902, null, 1]];
async function pageSupply() {
  const [s, st] = await Promise.all([api("supply"), api("stats")]);
  document.title = `${t("supply")} — LunariumCoin Explorer`;
  const ok = s.audit.violations === 0;
  const nodeDiff = s.nodeCheck ? Number(s.nodeCheck.diff) : null;
  app.innerHTML = `<div class="page-enter">
    ${title(icons.shield, t("supplyTitle"), t("supplySub"))}
    ${auditBanner({ ...st, auditViolations: s.audit.violations, height: s.height })}
    <div class="stats">
      <div class="stat gold"><div class="label">${icons.coins}${t("sSupply")}</div><div class="value">${amount(s.supply, { maxDec: 2 })}</div><div class="sub">${t("supplyHint")}</div></div>
      <div class="stat"><div class="label">${icons.layers}${t("expected")}</div><div class="value">${amount(s.expectedByRule, { maxDec: 2 })}</div><div class="sub">${t("expectedHint", { h: nf(s.height, 0) })}</div></div>
      <div class="stat"><div class="label">${icons.bolt}${t("mintedAll")}</div><div class="value">${amount(s.minted, { maxDec: 2 })}</div><div class="sub">${t("mintedHint")}</div></div>
      <div class="stat"><div class="label">${icons.shield}${t("nodeCheck")}</div><div class="value">${s.nodeCheck ? (Math.abs(nodeDiff) < 0.01 ? `<span class="up">✓ ${t("matches")}</span>` : `<span class="down">${nf(nodeDiff, 8)}</span>`) : "—"}</div><div class="sub">${s.nodeCheck ? `${t("nodeCheckHint")} #${nf(s.nodeCheck.height, 0)}` : t("pending")}</div></div>
    </div>
    <section class="card"><div class="card-head"><h2>${icons.shield}${t("auditHow")}</h2><span class="pill ${ok ? "ok" : "bad"}">${ok ? "✓ " + t("auditPass") : "✗ " + t("auditFail")}</span></div>
      <div class="card-pad muted" style="line-height:1.7">${t("auditExplain", { h: nf(s.audit.checkedUpTo, 0), mh: nf(s.mint.height, 0) })}
        ${s.audit.list.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>${t("block")}</th><th class="num">${t("minted")}</th><th class="num">${t("limit")}</th></tr></thead><tbody>${s.audit.list.map((v) => `<tr><td>${blockLink(v.height)}</td><td class="num">${amount(v.minted)}</td><td class="num">${amount(v.limit)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      </div></section>
    <section class="card" style="margin-top:18px"><div class="card-head"><h2>${icons.clock}${t("emission")}</h2></div>
      <div class="eras">${ERAS.map(([a, b, r]) => { const now = s.height >= a && (b === null || s.height <= b); return `<div class="era${now ? " now" : ""}"><div class="soft" style="font-size:11.5px">${now ? `<span class="up">● ${t("current")}</span>` : t("era")}</div><div class="r">${r} XLN</div><div class="h">${nf(a, 0)} – ${b ? nf(b, 0) : "∞"}</div>${now && b ? `<div class="progress" style="margin-top:8px"><span style="width:${((s.height - a) / (b - a)) * 100}%"></span></div><div class="h">${t("blocksLeft", { n: nf(b - s.height, 0) })}</div>` : ""}</div>`; }).join("")}</div>
      <div class="card-pad muted" style="padding-top:0">${t("emissionNote", { mint: amount(s.mint.amount, { maxDec: 0 }), h: nf(s.mint.height, 0) })}</div></section>
  </div>`;
}

async function pageCharts(_, query) {
  const days = Number(query.get("days") || 30);
  const rows = await api("charts?days=" + days);
  document.title = `${t("charts")} — LunariumCoin Explorer`;
  const box = (label, opts) => `<section class="card"><div class="card-head"><h3>${icons.chart}${label}</h3></div>${lineChart(rows, { label, ...opts })}</section>`;
  app.innerHTML = `<div class="page-enter">
    ${title(icons.chart, t("charts"), t("chartsSub"))}
    <div style="margin-bottom:16px" class="seg">${[30, 90, 180, 365].map((d) => `<button data-days="${d}" class="${d === days ? "on" : ""}">${d} ${t("days")}</button>`).join("")}</div>
    <div class="grid-2">
      ${box(t("txPerDay"), { y: (r) => r.txs, fmt: (v) => nf(v, 0) })}
      ${box(t("transfersPerDay"), { y: (r) => r.transfers, fmt: (v) => nf(v, 0) })}
      ${box(t("volumePerDay"), { y: (r) => Number(r.volume), fmt: (v) => nf(v, 0) + " XLN", alt: true })}
      ${box(t("avgBlockTime"), { y: (r) => r.avgBlockTime, fmt: (v) => nf(v, 1) + " s" })}
      ${box(t("difficulty"), { y: (r) => r.difficulty, fmt: (v) => nf(v, 2) })}
      ${box(t("blocksPerDay"), { y: (r) => r.blocks, fmt: (v) => nf(v, 0) })}
    </div></div>`;
  wireCharts(app);
  app.querySelectorAll("[data-days]").forEach((b) => b.addEventListener("click", () => go(`/charts?days=${b.dataset.days}`)));
}

async function pageMempool() {
  const list = await api("mempool");
  document.title = `${t("mempool")} — LunariumCoin Explorer`;
  app.innerHTML = `<div class="page-enter">${title(icons.pulse, t("mempool"), t("mempoolSub"))}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>${t("transaction")}</th><th class="num">${t("size")}</th><th class="num">${t("value")}</th></tr></thead><tbody>
    ${list.map((x) => `<tr><td>${txLink(x.txid, 14)}</td><td class="num">${nf(x.size, 0)} B</td><td class="num">${amount(x.value)}</td></tr>`).join("") || `<tr><td colspan="3" class="soft">${t("mempoolEmpty")}</td></tr>`}
    </tbody></table></div></section></div>`;
}

function pageApi() {
  document.title = `API — LunariumCoin Explorer`;
  const base = location.origin;
  const row = (p, d) => `<div class="api-row"><span class="m">GET</span><div><div class="p"><a href="${esc(p.replace(/:([a-z]+)/g, (m, k) => SAMPLE[k] || m))}" target="_blank" rel="noopener">${esc(p)}</a></div><div class="d">${d}</div></div></div>`;
  const SAMPLE = { id: "1569000", txid: "c56604aee2680ed37372ff345bd5ac852797aed298bcf4a5e62b377b4dd20c57", address: "LaPp6doiu3F3fjsqtzPgeBJ8u2wr9bAUMr", hash: "LaPp6doiu3F3fjsqtzPgeBJ8u2wr9bAUMr" };
  app.innerHTML = `<div class="page-enter">${title(icons.code, "API", t("apiSub"))}
    <section class="card"><div class="card-head"><h2>${icons.code}${t("apiNew")}</h2><span class="pill ok">JSON · CORS</span></div>
      ${row("/api/v1/stats", t("apiStats"))}${row("/api/v1/supply", t("apiSupply"))}${row("/api/v1/blocks?limit=20&before=:id", t("apiBlocks"))}
      ${row("/api/v1/block/:id", t("apiBlock"))}${row("/api/v1/tx/:txid", t("apiTx"))}${row("/api/v1/address/:address", t("apiAddress"))}
      ${row("/api/v1/address/:address/txs?offset=0&limit=25", t("apiAddressTxs"))}${row("/api/v1/address/:address/utxos", t("apiUtxos"))}
      ${row("/api/v1/richlist", t("apiRich"))}${row("/api/v1/masternodes", t("apiMn"))}${row("/api/v1/peers", t("apiPeers"))}
      ${row("/api/v1/movement?min=1000", t("apiMovement"))}${row("/api/v1/charts?days=30", t("apiCharts"))}${row("/api/v1/search?q=:id", t("apiSearch"))}
      ${row("/api/v1/mempool", t("apiMempool"))}${row("/api/v1/stream", t("apiStream"))}
      <div class="card-pad"><div class="code">curl ${esc(base)}/api/v1/stats</div><p class="soft" style="font-size:13px">${t("apiAmounts")}</p></div></section>
    <section class="card" style="margin-top:18px"><div class="card-head"><h2>${icons.layers}${t("apiCompat")}</h2></div>
      <div class="card-pad muted" style="padding-bottom:0">${t("apiCompatText")}</div>
      ${["/api/getblockcount", "/api/getdifficulty", "/api/getconnectioncount", "/api/getblockhash?index=:id", "/api/getnetworkhashps", "/api/getmasternodecount", "/api/getrawtransaction?txid=:txid&decrypt=1",
        "/ext/getmoneysupply", "/ext/getsummary", "/ext/getbasicstats", "/ext/getcurrentprice", "/ext/getdistribution", "/ext/getlasttxs/100/0/50", "/ext/gettx/:txid", "/ext/getaddress/:hash", "/ext/getaddresstxs/:hash/0/50",
        "/ext/getbalance/:hash", "/ext/getmasternodelist", "/ext/getmasternoderewards/:hash/1569000", "/ext/getmasternoderewardstotal/:hash/1569000", "/ext/getnetworkpeers"].map((p) => row(p, "")).join("")}
    </section></div>`;
}

async function pageClaim(_, query) {
  document.title = `${t("claimTitle")} — LunariumCoin Explorer`;
  const pre = query.get("address") || "";
  app.innerHTML = `<div class="page-enter">
    ${title(icons.tag, t("claimTitle"), t("claimSub"))}
    <div class="grid-2 claim-grid">
      <section class="card card-pad">
        <form id="claimForm" class="claim-form" autocomplete="off">
          <label>${t("address")}<input class="field hash" name="address" value="${esc(pre)}" placeholder="L…" spellcheck="false" required/></label>
          <label>${t("claimName")}<input class="field" name="name" maxlength="32" placeholder="${esc(t("claimNamePh"))}" spellcheck="false"/><small class="soft">${t("claimNameRules")}</small></label>
          <div class="claim-cmd"><div class="soft">${t("claimCmdLabel")}</div><div class="code" id="claimCmd"></div><button type="button" class="btn btn-sm" id="claimCopy">${icons.copy} ${t("copy")}</button></div>
          <label>${t("claimSignature")}<textarea class="field hash" name="signature" rows="3" placeholder="H…=" spellcheck="false" required></textarea></label>
          <button class="btn primary" type="submit">${icons.tag} ${t("claimSubmit")}</button>
          <div id="claimMsg" class="claim-msg" role="status"></div>
        </form>
      </section>
      <section class="card card-pad claim-help">
        <h3>${t("claimHow")}</h3>
        <ol><li>${t("claimStep1")}</li><li>${t("claimStep2")}</li><li>${t("claimStep3")}</li><li>${t("claimStep4")}</li></ol>
        <div class="notice">${t("claimRemove")}</div>
        <p class="soft">${t("claimRulesNote")}</p>
      </section>
    </div></div>`;
  const f = app.querySelector("#claimForm"), cmd = app.querySelector("#claimCmd"), msg = app.querySelector("#claimMsg");
  const quote = (v) => JSON.stringify(String(v));
  const upd = () => { cmd.textContent = `signmessage ${quote(f.address.value.trim() || "L…")} ${quote(f.name.value.trim())}`; };
  f.address.addEventListener("input", upd);
  f.name.addEventListener("input", upd);
  upd();
  app.querySelector("#claimCopy").addEventListener("click", () => navigator.clipboard?.writeText(cmd.textContent).then(() => toast(t("copied"))));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.className = "claim-msg";
    msg.textContent = t("loading");
    try {
      const r = await fetch("/api/v1/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: f.address.value.trim(), name: f.name.value, signature: f.signature.value.trim() }) });
      const j = await r.json();
      if (!j.ok) {
        const key = "claimErr_" + j.code;
        msg.className = "claim-msg bad";
        msg.textContent = t(key) !== key ? t(key) : j.error || t("errorTitle");
        return;
      }
      await loadNames();
      msg.className = "claim-msg ok";
      msg.innerHTML = `${j.removed ? t("claimRemoved") : t("claimOk", { name: esc(j.name) })} <a href="/address/${esc(j.address)}" data-link>${t("seeAddress")} →</a>`;
    } catch {
      msg.className = "claim-msg bad";
      msg.textContent = t("errorTitle");
    }
  });
}

// ---------------- roteador ----------------
const ROUTES = [
  [/^\/$/, pageHome, "home"],
  [/^\/blocks\/?$/, pageBlocks, "blocks"],
  [/^\/block\/([^/]+)\/?$/, (m, q) => pageBlock({ id: m[1] }, q), "blocks"],
  [/^\/tx\/([0-9a-fA-F]{64})\/?$/, (m, q) => pageTx({ id: m[1] }, q), ""],
  [/^\/address\/([1-9A-HJ-NP-Za-km-z]{20,40})\/?$/, (m, q) => pageAddress({ id: m[1] }, q), ""],
  [/^\/masternodes\/?$/, pageMasternodes, "masternodes"],
  [/^\/richlist\/?$/, pageRichlist, "richlist"],
  [/^\/network\/?$/, pageNetwork, "network"],
  [/^\/movement\/?$/, pageMovement, "movement"],
  [/^\/supply\/?$/, pageSupply, "supply"],
  [/^\/charts\/?$/, pageCharts, "charts"],
  [/^\/mempool\/?$/, pageMempool, "mempool"],
  [/^\/(api-docs|info)\/?$/, pageApi, "api"],
  [/^\/claim\/?$/, pageClaim, "claim"],
];
const NAV = [["/blocks", "blocks"], ["/masternodes", "masternodes"], ["/richlist", "richlist"], ["/network", "network"], ["/movement", "movement"], ["/supply", "supply"], ["/charts", "charts"], ["/claim", "claim"], ["/api-docs", "api"]];

async function render() {
  liveHandler = null;
  if (pageCleanup) { try { pageCleanup(); } catch {} pageCleanup = null; }
  if (!firstRender) trackView();
  firstRender = false;
  const url = new URL(location.href);
  const path = url.pathname;
  let route = ROUTES.find(([re]) => re.test(path));
  document.querySelectorAll("#mainnav a").forEach((a) => a.classList.toggle("active", !!route && a.dataset.key === route[2]));
  $("#mainnav").classList.remove("open");
  if (!route) { app.innerHTML = errorView({ status: 404 }); return; }
  app.innerHTML = loading();
  try {
    const m = path.match(route[0]);
    await route[1](m.length > 1 ? m : {}, url.searchParams);
  } catch (e) {
    app.innerHTML = errorView(e);
  }
}

function go(href, replace = false) {
  if (replace) history.replaceState({}, "", href); else history.pushState({}, "", href);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  render();
}

async function doSearch(q) {
  q = q.trim();
  if (!q) return;
  try {
    const r = await api("search?q=" + encodeURIComponent(q));
    go(`/${r.type}/${r.id}`);
  } catch (e) {
    toast(t("searchNone"));
  }
}

function chrome() {
  $("#mainnav").innerHTML = NAV.map(([href, key]) => `<a href="${href}" data-link data-key="${key}">${t("nav_" + key)}</a>`).join("");
  $("#topSearch input").placeholder = t("searchShort");
  const curLang = LANGS.find((l) => l.code === lang()) || LANGS[0];
  $("#lang").innerHTML = `<button type="button" class="lang-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(t("language"))}">${flagOf(curLang.code)}<span>${esc(curLang.label)}</span><svg class="chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    <ul class="lang-menu" role="listbox" aria-label="${esc(t("language"))}" hidden>${LANGS.map((l) => `<li role="option" tabindex="-1" data-lang="${l.code}" aria-selected="${l.code === curLang.code}">${flagOf(l.code)}<span dir="${l.dir}">${esc(l.label)}</span></li>`).join("")}</ul>`;
  $("#footer").innerHTML = `<div class="footer-inner">
    <div><div class="fbrand"><img src="/assets/logo.png" alt="" width="38" height="38"/><div><strong>LunariumCoin Explorer</strong><div class="soft" style="font-size:12.5px">${t("footerTag")}</div></div></div>
      <div class="copy-note">${t("footerNote")}</div></div>
    <div><h4>${t("fExplore")}</h4><a href="/blocks" data-link>${t("nav_blocks")}</a><a href="/masternodes" data-link>${t("nav_masternodes")}</a><a href="/richlist" data-link>${t("nav_richlist")}</a><a href="/mempool" data-link>${t("mempool")}</a></div>
    <div><h4>${t("fNetwork")}</h4><a href="/network" data-link>${t("nav_network")}</a><a href="/supply" data-link>${t("nav_supply")}</a><a href="/charts" data-link>${t("nav_charts")}</a><a href="/api-docs" data-link>API</a></div>
    <div><h4>LunariumCoin</h4><a href="https://lunariumcoin.com" rel="noopener" target="_blank">lunariumcoin.com</a><a href="https://github.com/Lunariumcoin-Labs" rel="noopener" target="_blank">GitHub</a><a href="https://galaxia.lunariumcoin.com/?coin=xln" rel="noopener" target="_blank">GaláxiaLunarium</a><a href="https://t.me/+ctL9XBvKQW42ZGUx" rel="noopener" target="_blank">Telegram</a></div>
  </div>`;
}

document.addEventListener("click", (e) => {
  const c = e.target.closest("[data-copy]");
  if (c) { navigator.clipboard?.writeText(c.dataset.copy).then(() => toast(t("copied"))); return; }
  const a = e.target.closest("a[data-link]");
  if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey && a.origin === location.origin) { e.preventDefault(); go(a.getAttribute("href")); }
});
document.addEventListener("submit", (e) => {
  const f = e.target;
  if (f.id === "topSearch" || f.hasAttribute("data-search")) { e.preventDefault(); doSearch(f.q.value); f.q.blur(); }
  if (f.hasAttribute("data-filter")) { e.preventDefault(); go(`${location.pathname}?q=${encodeURIComponent(f.q.value)}`, true); }
});
// Menu de idiomas (com bandeiras): abre/fecha, escolhe, teclado (setas, Enter, Esc) e clique fora fecha.
function langMenu(open) {
  const btn = $("#lang .lang-btn"), menu = $("#lang .lang-menu");
  if (!btn || !menu) return;
  const willOpen = open ?? menu.hidden;
  menu.hidden = !willOpen;
  btn.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) (menu.querySelector('[aria-selected="true"]') || menu.firstElementChild)?.focus();
}
function pickLang(code) {
  langMenu(false);
  if (code && code !== lang()) { setLang(code); chrome(); render(); }
}
document.addEventListener("click", (e) => {
  if (e.target.closest("#lang .lang-btn")) { langMenu(); return; }
  const opt = e.target.closest("#lang [data-lang]");
  if (opt) { pickLang(opt.dataset.lang); return; }
  if (!e.target.closest("#lang")) langMenu(false);
});
document.addEventListener("keydown", (e) => {
  const menu = $("#lang .lang-menu");
  if (!menu || menu.hidden) return;
  const items = [...menu.querySelectorAll("[data-lang]")];
  const i = items.indexOf(document.activeElement);
  if (e.key === "Escape") { langMenu(false); $("#lang .lang-btn").focus(); }
  else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if ((e.key === "Enter" || e.key === " ") && i >= 0) { e.preventDefault(); pickLang(items[i].dataset.lang); }
});
$("#menuBtn").addEventListener("click", () => {
  const nav = $("#mainnav");
  nav.classList.toggle("open");
  $("#menuBtn").setAttribute("aria-expanded", nav.classList.contains("open"));
});
window.addEventListener("popstate", render);

// eventos ao vivo: um só canal para o site inteiro
function connectStream() {
  if (!("EventSource" in window)) return;
  const es = new EventSource("/api/v1/stream");
  es.addEventListener("tip", (m) => { try { const d = JSON.parse(m.data); if (liveHandler) liveHandler(d); } catch {} });
  es.onerror = () => { es.close(); setTimeout(connectStream, 15000); };
}

initLang();
const namesReady = loadNames();
startVisits();
startSpace($("#space"));
chrome();
// os apelidos chegam antes da primeira página (no máximo 1,5 s de espera; sem eles a página abre igual)
Promise.race([namesReady, new Promise((r) => setTimeout(r, 1500))]).then(render);
connectStream();
