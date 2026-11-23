// Arte original do explorador (vetorial): astronauta da Lunarium, planetas e ícones.

export function astronautSvg() {
  return `
<svg class="astronaut" viewBox="-60 -10 440 440" role="img" aria-label="Astronauta Lunarium">
  <defs>
    <linearGradient id="suit" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#dbe3ee"/><stop offset="1" stop-color="#93a5bd"/>
    </linearGradient>
    <linearGradient id="pack" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c9d3e0"/><stop offset="1" stop-color="#6f8098"/>
    </linearGradient>
    <radialGradient id="visor" cx=".35" cy=".3" r=".85">
      <stop offset="0" stop-color="#2d76c0"/><stop offset=".45" stop-color="#0d2c5a"/><stop offset="1" stop-color="#040b1c"/>
    </radialGradient>
    <radialGradient id="neb" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#7ff0ff" stop-opacity=".75"/><stop offset=".6" stop-color="#7b5cff" stop-opacity=".25"/><stop offset="1" stop-color="#7b5cff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#5fe0f5" stop-opacity=".9"/><stop offset="1" stop-color="#5fe0f5" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="visorClip"><ellipse cx="198" cy="112" rx="56" ry="48"/></clipPath>
    <clipPath id="patchClip"><circle cx="153" cy="207" r="15"/></clipPath>
  </defs>
  <path class="tether" d="M122 210 C 40 240, 10 330, -70 420" fill="none" stroke="#8fa3bd" stroke-width="3" stroke-linecap="round" opacity=".85"/>
  <g class="astro-body">
    <rect x="108" y="146" width="154" height="156" rx="28" fill="url(#pack)" stroke="#5d6e86" stroke-width="1.5"/>
    <rect x="120" y="160" width="12" height="40" rx="5" fill="#4b5b72"/>
    <path d="M160 300 Q 150 345 120 372" stroke="url(#suit)" stroke-width="46" stroke-linecap="round" fill="none"/>
    <path d="M212 300 Q 236 342 252 380" stroke="url(#suit)" stroke-width="46" stroke-linecap="round" fill="none"/>
    <path d="M150 332 Q 140 352 128 362" stroke="#a9b8cb" stroke-width="5" stroke-linecap="round" fill="none" opacity=".7"/>
    <ellipse cx="110" cy="384" rx="31" ry="20" fill="#e6ecf4" stroke="#7d8fa8" stroke-width="2"/>
    <path d="M82 392 Q 110 404 140 392" stroke="#3f4d62" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="260" cy="394" rx="31" ry="20" fill="#e6ecf4" stroke="#7d8fa8" stroke-width="2" transform="rotate(14 260 394)"/>
    <path d="M232 398 Q 258 414 290 406" stroke="#3f4d62" stroke-width="5" fill="none" stroke-linecap="round"/>
    <rect x="138" y="168" width="112" height="152" rx="46" fill="url(#suit)" stroke="#8aa0b8" stroke-width="1.5"/>
    <path d="M142 290 Q 194 304 246 290" stroke="#9fb0c5" stroke-width="6" fill="none"/>
    <rect x="160" y="214" width="68" height="50" rx="9" fill="#13213a" stroke="#5c7494" stroke-width="1.5"/>
    <circle class="blink b1" cx="176" cy="230" r="5" fill="#32b9d6"/>
    <circle class="blink b2" cx="194" cy="230" r="5" fill="#f3b747"/>
    <circle class="blink b3" cx="212" cy="230" r="5" fill="#5bed91"/>
    <rect x="170" y="244" width="48" height="5" rx="2.5" fill="#2e4566"/>
    <rect x="170" y="253" width="30" height="5" rx="2.5" fill="#2e4566"/>
    <path d="M148 204 Q 96 184 84 132" stroke="url(#suit)" stroke-width="38" stroke-linecap="round" fill="none"/>
    <circle cx="82" cy="116" r="21" fill="#eef3f8" stroke="#8aa0b8" stroke-width="1.5"/>
    <path d="M240 206 Q 292 232 302 282" stroke="url(#suit)" stroke-width="38" stroke-linecap="round" fill="none"/>
    <circle cx="304" cy="296" r="21" fill="#eef3f8" stroke="#8aa0b8" stroke-width="1.5"/>
    <circle cx="153" cy="207" r="17" fill="#0b1830" stroke="#f3b747" stroke-width="2"/>
    <image href="/assets/logo.png" x="138" y="192" width="30" height="30" clip-path="url(#patchClip)"/>
    <ellipse cx="194" cy="170" rx="52" ry="14" fill="#9fb0c5" stroke="#7d8fa8" stroke-width="1.5"/>
    <circle cx="196" cy="110" r="77" fill="url(#suit)" stroke="#8aa0b8" stroke-width="2"/>
    <ellipse cx="198" cy="112" rx="58" ry="50" fill="#26364d"/>
    <ellipse cx="198" cy="112" rx="56" ry="48" fill="url(#visor)"/>
    <g clip-path="url(#visorClip)">
      <ellipse cx="178" cy="96" rx="46" ry="20" fill="url(#neb)" transform="rotate(-18 178 96)"/>
      <circle cx="160" cy="128" r="1.4" fill="#fff"/><circle cx="214" cy="84" r="1.1" fill="#fff"/><circle cx="232" cy="104" r="1.6" fill="#fff"/>
      <circle cx="188" cy="140" r="1" fill="#fff"/><circle cx="170" cy="84" r="1" fill="#cfe8ff"/>
      <circle cx="228" cy="136" r="15" fill="#f3b747" opacity=".85"/>
      <circle cx="234" cy="131" r="15" fill="#0d2c5a"/>
      <path d="M150 92 Q 160 70 190 66" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".55"/>
      <circle cx="148" cy="106" r="4" fill="#fff" opacity=".6"/>
    </g>
    <circle cx="124" cy="96" r="14" fill="url(#glow)" class="helmet-light"/>
    <circle cx="124" cy="96" r="4.5" fill="#d6fbff"/>
    <rect x="252" y="40" width="5" height="26" rx="2.5" fill="#8aa0b8"/>
    <circle cx="254.5" cy="38" r="6" fill="#f3b747" class="blink b2"/>
  </g>
</svg>`;
}

export function planetsSvg() {
  return `
<svg class="planets" viewBox="0 0 600 600" aria-hidden="true">
  <defs>
    <radialGradient id="pl1" cx=".35" cy=".3" r=".8">
      <stop offset="0" stop-color="#8f7bff"/><stop offset=".45" stop-color="#3f2fa8"/><stop offset="1" stop-color="#0b0b2e"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5fe0f5" stop-opacity="0"/><stop offset=".3" stop-color="#5fe0f5" stop-opacity=".8"/>
      <stop offset=".7" stop-color="#f3b747" stop-opacity=".75"/><stop offset="1" stop-color="#f3b747" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="pl2" cx=".35" cy=".3" r=".8">
      <stop offset="0" stop-color="#e9eef5"/><stop offset=".6" stop-color="#8d99ab"/><stop offset="1" stop-color="#2c3442"/>
    </radialGradient>
    <radialGradient id="pl3" cx=".35" cy=".3" r=".8">
      <stop offset="0" stop-color="#7ff0ff"/><stop offset=".5" stop-color="#1f7ea0"/><stop offset="1" stop-color="#062033"/>
    </radialGradient>
    <clipPath id="ringBack"><rect x="0" y="0" width="600" height="352"/></clipPath>
    <clipPath id="ringFront"><rect x="0" y="352" width="600" height="300"/></clipPath>
  </defs>
  <g class="pl-big">
    <ellipse cx="340" cy="352" rx="210" ry="46" fill="none" stroke="url(#ring)" stroke-width="10" clip-path="url(#ringBack)" transform="rotate(-14 340 352)"/>
    <circle cx="340" cy="352" r="130" fill="url(#pl1)"/>
    <path d="M220 320 Q 340 290 460 330" stroke="#a99bff" stroke-width="8" fill="none" opacity=".18"/>
    <path d="M214 372 Q 340 345 466 380" stroke="#c6bbff" stroke-width="5" fill="none" opacity=".14"/>
    <ellipse cx="340" cy="352" rx="210" ry="46" fill="none" stroke="url(#ring)" stroke-width="10" clip-path="url(#ringFront)" transform="rotate(-14 340 352)"/>
  </g>
  <g class="pl-moon">
    <circle cx="110" cy="120" r="44" fill="url(#pl2)"/>
    <circle cx="96" cy="108" r="8" fill="#6f7b8d" opacity=".55"/><circle cx="124" cy="136" r="5" fill="#6f7b8d" opacity=".5"/><circle cx="120" cy="100" r="3.5" fill="#6f7b8d" opacity=".5"/>
  </g>
  <g class="pl-small"><circle cx="520" cy="90" r="22" fill="url(#pl3)"/></g>
</svg>`;
}

const I = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const icons = {
  cube: I("M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10"),
  coins: I("M8 7a5 2.5 0 1 0 10 0 5 2.5 0 1 0-10 0M8 7v5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7M3 12a5 2.5 0 0 0 5 2.4M3 12v5c0 1.4 2.2 2.5 5 2.5 1.2 0 2.3-.2 3.2-.6M3 12c0-1.2 1.6-2.2 3.9-2.4"),
  dollar: I("M12 2v20M17 6.5C16 5 14.2 4.5 12 4.5c-3 0-5 1.4-5 3.6 0 5 10 2.3 10 7.6 0 2.2-2.2 3.8-5 3.8-2.6 0-4.4-.8-5.4-2.4"),
  server: I("M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01M12 7h5M12 17h5"),
  gauge: I("M12 14l4-4M3.5 17a9 9 0 1 1 17 0M12 5v2M5.6 7.6l1.4 1.4M18.4 7.6 17 9"),
  bolt: I("M13 2 4 14h7l-1 8 9-12h-7z"),
  clock: I("M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18"),
  swap: I("M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"),
  shield: I("M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM8.5 12l2.5 2.5 4.5-5"),
  globe: I("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3"),
  users: I("M16 20v-1.5c0-2-2-3.5-4.5-3.5h-3C6 15 4 16.5 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.3c0-1.7-1.3-3-3-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6"),
  copy: I("M9 9h11v11H9zM5 15H4V4h11v1"),
  arrow: I("M5 12h14M13 6l6 6-6 6"),
  chart: I("M4 20V4M4 20h16M8 16l4-5 3 3 5-7"),
  layers: I("M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17l10 5 10-5"),
  link: I("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"),
  pulse: I("M3 12h4l2-6 4 12 2-6h6"),
  star: I("M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"),
  code: I("M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"),
  tag: I("M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01"),
  check: I("M12 2.5l2.4 1.8 3-.2.9 2.9 2.4 1.8-1 2.8 1 2.8-2.4 1.8-.9 2.9-3-.2L12 21.5l-2.4-1.8-3 .2-.9-2.9L3.3 15.2l1-2.8-1-2.8 2.4-1.8.9-2.9 3 .2zM8.5 12l2.4 2.4 4.6-4.8"),
};
