// Flags (flag-icons 7.2.3, MIT license: web/assets/flags/LICENSE.txt), served by the explorer itself.
// Flag emoji do not render on Windows (they show as "BR", "US"), hence SVG images.
const AVAILABLE = new Set("ADAEAFAGAIALAMAOAQARASATAUAWAXAZBABBBDBEBFBGBHBIBJBLBMBNBOBQBRBSBTBVBWBYBZCACCCDCFCGCHCICKCLCMCNCOCPCRCUCVCWCXCYCZDEDGDJDKDMDODZECEEEGEHERESETEUFIFJFKFMFOFRGAGBGDGEGFGGGHGIGLGMGNGPGQGRGSGTGUGWGYHKHMHNHRHTHUICIDIEILIMINIOIQIRISITJEJMJOJPKEKGKHKIKMKNKPKRKWKYKZLALBLCLILKLRLSLTLULVLYMAMCMDMEMFMGMHMKMLMMMNMOMPMQMRMSMTMUMVMWMXMYMZNANCNENFNGNINLNONPNRNUNZOMPAPCPEPFPGPHPKPLPMPNPRPSPTPWPYQARERORSRURWSASBSCSDSESGSHSISJSKSLSMSNSOSRSSSTSVSXSYSZTCTDTFTGTHTJTKTLTMTNTOTRTTTVTWTZUAUGUMUNUSUYUZVAVCVEVGVIVNVUWFWSXKXXYEYTZAZMZW".match(/../g));

// country of each site language
const LANG_COUNTRY = { pt: "BR", en: "US", es: "ES", ar: "SA", zh: "CN", ru: "RU", ja: "JP", he: "IL", hi: "IN", it: "IT" };

/** Flag of a country (2-letter ISO code); a globe when no flag is known. */
export function countryFlag(cc, cls = "flag") {
  const c = String(cc || "").toUpperCase();
  if (!AVAILABLE.has(c)) return `<span class="${cls} flag-none" aria-hidden="true">🌐</span>`;
  return `<img class="${cls}" src="/assets/flags/${c.toLowerCase()}.svg" alt="" width="22" height="16"/>`;
}

/** Flag of the country of a site language. */
export const flagOf = (lang) => countryFlag(LANG_COUNTRY[lang]);
