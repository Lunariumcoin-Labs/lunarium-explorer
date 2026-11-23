// Bandeiras dos idiomas em SVG (emoji de bandeira não aparece no Windows: lá vira "BR", "US").
// Desenhos simplificados, proporção 3:2, para o tamanho de ícone do seletor de idioma.
const W = 30, H = 20;
const svg = (body) => `<svg class="flag" viewBox="0 0 ${W} ${H}" width="22" height="15" aria-hidden="true">${body}</svg>`;
const star = (cx, cy, r, fill, rot = -90) => {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180, rr = i % 2 ? r * 0.4 : r;
    d += `${i ? "L" : "M"}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }
  return `<path d="${d}Z" fill="${fill}"/>`;
};

const FLAGS = {
  // Brasil
  pt: svg(`<rect width="30" height="20" fill="#009c3b"/><path d="M15 2.2 27.6 10 15 17.8 2.4 10z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/><path d="M10.6 9.2c2.9-.6 6-.3 8.7 1.1" stroke="#fff" stroke-width=".8" fill="none"/>`),
  // Estados Unidos
  en: svg(`<rect width="30" height="20" fill="#fff"/>${[0, 2, 4, 6, 8, 10, 12].map((i) => `<rect y="${(i * 20) / 13}" width="30" height="${20 / 13}" fill="#b22234"/>`).join("")}<rect width="13" height="${(7 * 20) / 13}" fill="#3c3b6e"/>${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<circle cx="${1.9 + c * 3.1}" cy="${1.8 + r * 3.3}" r=".55" fill="#fff"/>`).join("")).join("")}`),
  // Espanha
  es: svg(`<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/><rect x="7" y="7.6" width="3.2" height="4.8" rx=".6" fill="#aa151b" opacity=".85"/>`),
  // Arábia Saudita
  ar: svg(`<rect width="30" height="20" fill="#006c35"/><path d="M7.5 7.2h15M8.5 9.2h13M9.5 7.2v2" stroke="#fff" stroke-width=".9" stroke-linecap="round"/><path d="M8 13.4h13.5l1.2-.8" stroke="#fff" stroke-width=".9" fill="none" stroke-linecap="round"/>`),
  // China
  zh: svg(`<rect width="30" height="20" fill="#de2910"/>${star(5.5, 5.5, 3, "#ffde00")}${star(10.4, 2.4, 1, "#ffde00", -50)}${star(12.4, 4.6, 1, "#ffde00", -20)}${star(12.4, 7.6, 1, "#ffde00", 0)}${star(10.4, 9.8, 1, "#ffde00", 20)}`),
  // Rússia
  ru: svg(`<rect width="30" height="20" fill="#fff"/><rect y="6.67" width="30" height="6.67" fill="#0039a6"/><rect y="13.33" width="30" height="6.67" fill="#d52b1e"/>`),
  // Japão
  ja: svg(`<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>`),
  // Israel
  he: svg(`<rect width="30" height="20" fill="#fff"/><rect y="2" width="30" height="2.6" fill="#0038b8"/><rect y="15.4" width="30" height="2.6" fill="#0038b8"/><path d="M15 6.3 18.2 11.85H11.8zM15 13.7 11.8 8.15H18.2z" fill="none" stroke="#0038b8" stroke-width=".9"/>`),
  // Índia
  hi: svg(`<rect width="30" height="20" fill="#fff"/><rect width="30" height="6.67" fill="#ff9933"/><rect y="13.33" width="30" height="6.67" fill="#138808"/><circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" stroke-width=".55"/><circle cx="15" cy="10" r=".55" fill="#000080"/>${Array.from({ length: 12 }, (_, i) => { const a = (i * 30 * Math.PI) / 180; return `<path d="M15 10L${(15 + 2.6 * Math.cos(a)).toFixed(2)} ${(10 + 2.6 * Math.sin(a)).toFixed(2)}" stroke="#000080" stroke-width=".25"/>`; }).join("")}`),
  // Itália
  it: svg(`<rect width="30" height="20" fill="#fff"/><rect width="10" height="20" fill="#009246"/><rect x="20" width="10" height="20" fill="#ce2b37"/>`),
};

export const flagOf = (code) => FLAGS[code] || "";
