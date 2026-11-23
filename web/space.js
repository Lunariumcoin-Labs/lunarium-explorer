// Fundo espacial: estrelas em 3 camadas, galáxia espiral girando devagar e estrelas cadentes.
// Leve de propósito: a galáxia é desenhada uma vez num canvas fora da tela e só girada a cada quadro.

export function startSpace(canvas) {
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  let W = 0, H = 0, stars = [], galaxy = null, galaxy2 = null, meteors = [], raf = 0, t0 = performance.now();

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeGalaxy(size, arms, hueCore, hueArm, count) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const R = size / 2;
    // halo
    const halo = g.createRadialGradient(R, R, 0, R, R, R);
    halo.addColorStop(0, `hsla(${hueCore}, 90%, 80%, 0.55)`);
    halo.addColorStop(0.12, `hsla(${hueCore}, 80%, 60%, 0.22)`);
    halo.addColorStop(0.45, `hsla(${hueArm}, 70%, 45%, 0.07)`);
    halo.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, size, size);
    // braços (espiral logarítmica com dispersão)
    for (let i = 0; i < count; i++) {
      const arm = i % arms;
      const d = Math.pow(Math.random(), 1.6);
      const r = d * R * 0.95;
      const theta = (arm / arms) * Math.PI * 2 + d * 7.2 + rand(-0.35, 0.35) * (1 - d * 0.5);
      const spread = rand(-1, 1) * (6 + 22 * d) * (size / 900);
      const x = R + Math.cos(theta) * r + spread;
      const y = R + Math.sin(theta) * r * 0.92 + spread;
      const hue = d < 0.18 ? hueCore : hueArm + rand(-18, 18);
      const light = d < 0.18 ? 82 : rand(60, 82);
      const a = (1 - d) * 0.55 + 0.08;
      g.fillStyle = `hsla(${hue}, 85%, ${light}%, ${a})`;
      const s = Math.random() < 0.02 ? 2.2 : rand(0.5, 1.4);
      g.fillRect(x, y, s, s);
    }
    // núcleo
    const core = g.createRadialGradient(R, R, 0, R, R, R * 0.12);
    core.addColorStop(0, "rgba(255,246,220,0.95)");
    core.addColorStop(1, "rgba(255,210,140,0)");
    g.fillStyle = core;
    g.beginPath(); g.arc(R, R, R * 0.12, 0, Math.PI * 2); g.fill();
    return c;
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const n = Math.round(Math.min(900, (W * H) / 2200));
    stars = Array.from({ length: n }, () => {
      const layer = Math.random();
      return {
        x: Math.random() * W, y: Math.random() * H,
        r: layer < 0.75 ? rand(0.3, 0.9) : layer < 0.96 ? rand(0.9, 1.5) : rand(1.5, 2.2),
        tw: rand(0.002, 0.006), ph: rand(0, Math.PI * 2),
        drift: layer < 0.75 ? 0.004 : layer < 0.96 ? 0.009 : 0.016,
        hue: Math.random() < 0.15 ? 40 : Math.random() < 0.3 ? 200 : 220,
      };
    });
    if (!W || !H) return;
    const gs = Math.round(Math.min(1100, Math.max(320, Math.max(W, H) * 0.85)));
    galaxy = makeGalaxy(gs, 3, 42, 205, 14000);
    galaxy2 = makeGalaxy(Math.round(gs * 0.35), 2, 300, 265, 3000);
  }

  function draw(now) {
    const t = now - t0;
    if (!W || !H || !galaxy?.width || !galaxy2?.width) { if (!reduce) raf = requestAnimationFrame(draw); return; }
    ctx.clearRect(0, 0, W, H);
    // galáxia principal (canto superior direito) e uma pequena ao fundo
    const rot = reduce ? 0.6 : t * 0.0000045;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(W * 0.78, H * 0.3);
    ctx.scale(1, 0.55);
    ctx.rotate(rot);
    ctx.drawImage(galaxy, -galaxy.width / 2, -galaxy.height / 2);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.translate(W * 0.12, H * 0.82);
    ctx.scale(1, 0.62);
    ctx.rotate(-rot * 1.6 + 1.2);
    ctx.drawImage(galaxy2, -galaxy2.width / 2, -galaxy2.height / 2);
    ctx.restore();

    // estrelas
    for (const s of stars) {
      const y = reduce ? s.y : (s.y + t * s.drift * 0.06) % H;
      const a = reduce ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(s.ph + t * s.tw * 0.25));
      ctx.fillStyle = `hsla(${s.hue}, 80%, 92%, ${a})`;
      ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, Math.PI * 2); ctx.fill();
      if (s.r > 1.6) {
        ctx.fillStyle = `hsla(${s.hue}, 90%, 85%, ${a * 0.18})`;
        ctx.beginPath(); ctx.arc(s.x, y, s.r * 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // estrelas cadentes
    if (!reduce && Math.random() < 0.004 && meteors.length < 2) {
      meteors.push({ x: rand(W * 0.1, W), y: rand(-20, H * 0.4), vx: rand(-9, -6), vy: rand(3, 5), life: 1 });
    }
    for (const m of meteors) {
      m.x += m.vx; m.y += m.vy; m.life -= 0.012;
      const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14);
      grad.addColorStop(0, `rgba(220,240,255,${0.9 * m.life})`);
      grad.addColorStop(1, "rgba(120,200,255,0)");
      ctx.strokeStyle = grad; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 14, m.y - m.vy * 14); ctx.stroke();
    }
    meteors = meteors.filter((m) => m.life > 0 && m.x > -200 && m.y < H + 200);

    if (!reduce) raf = requestAnimationFrame(draw);
  }

  resize();
  let rT;
  window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { resize(); if (reduce) draw(performance.now()); }, 150); });
  document.addEventListener("visibilitychange", () => {
    if (reduce) return;
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(draw);
  });
  raf = requestAnimationFrame(draw);
}
