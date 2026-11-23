// Bandeiras (flag-icons 7.2.3, licença MIT: web/assets/flags/LICENSE.txt), servidas pelo próprio explorador.
// Emoji de bandeira não aparece no Windows (lá vira "BR", "US"), por isso imagens SVG.
const AVAILABLE = new Set("ADAEAFAGAIALAMAOAQARASATAUAWAXAZBABBBDBEBFBGBHBIBJBLBMBNBOBQBRBSBTBVBWBYBZCACCCDCFCGCHCICKCLCMCNCOCPCRCUCVCWCXCYCZDEDGDJDKDMDODZECEEEGEHERESETEUFIFJFKFMFOFRGAGBGDGEGFGGGHGIGLGMGNGPGQGRGSGTGUGWGYHKHMHNHRHTHUICIDIEILIMINIOIQIRISITJEJMJOJPKEKGKHKIKMKNKPKRKWKYKZLALBLCLILKLRLSLTLULVLYMAMCMDMEMFMGMHMKMLMMMNMOMPMQMRMSMTMUMVMWMXMYMZNANCNENFNGNINLNONPNRNUNZOMPAPCPEPFPGPHPKPLPMPNPRPSPTPWPYQARERORSRURWSASBSCSDSESGSHSISJSKSLSMSNSOSRSSSTSVSXSYSZTCTDTFTGTHTJTKTLTMTNTOTRTTTVTWTZUAUGUMUNUSUYUZVAVCVEVGVIVNVUWFWSXKXXYEYTZAZMZW".match(/../g));

// país de cada idioma do site
const LANG_COUNTRY = { pt: "BR", en: "US", es: "ES", ar: "SA", zh: "CN", ru: "RU", ja: "JP", he: "IL", hi: "IN", it: "IT" };

/** Bandeira de um país (código ISO de 2 letras); sem bandeira conhecida, um globo. */
export function countryFlag(cc, cls = "flag") {
  const c = String(cc || "").toUpperCase();
  if (!AVAILABLE.has(c)) return `<span class="${cls} flag-none" aria-hidden="true">🌐</span>`;
  return `<img class="${cls}" src="/assets/flags/${c.toLowerCase()}.svg" alt="" width="22" height="16"/>`;
}

/** Bandeira do país de um idioma do site. */
export const flagOf = (lang) => countryFlag(LANG_COUNTRY[lang]);
