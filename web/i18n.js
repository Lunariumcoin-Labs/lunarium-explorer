// Explorer languages: the same 34 as GaláxiaLunarium.
import pt from "./i18n/pt.js";
import en from "./i18n/en.js";
import es from "./i18n/es.js";
import de from "./i18n/de.js";
import fr from "./i18n/fr.js";
import it from "./i18n/it.js";
import nl from "./i18n/nl.js";
import pl from "./i18n/pl.js";
import ru from "./i18n/ru.js";
import uk from "./i18n/uk.js";
import tr from "./i18n/tr.js";
import ar from "./i18n/ar.js";
import he from "./i18n/he.js";
import hi from "./i18n/hi.js";
import zh from "./i18n/zh.js";
import zhTW from "./i18n/zh-TW.js";
import ja from "./i18n/ja.js";
import ko from "./i18n/ko.js";
import vi from "./i18n/vi.js";
import th from "./i18n/th.js";
import id from "./i18n/id.js";
import bg from "./i18n/bg.js";
import cs from "./i18n/cs.js";
import sk from "./i18n/sk.js";
import sl from "./i18n/sl.js";
import hr from "./i18n/hr.js";
import hu from "./i18n/hu.js";
import ro from "./i18n/ro.js";
import el from "./i18n/el.js";
import lt from "./i18n/lt.js";
import da from "./i18n/da.js";
import sv from "./i18n/sv.js";
import no from "./i18n/no.js";
import fi from "./i18n/fi.js";

export const LANGS = [
  { code: "pt", intl: "pt-BR", label: "Português", dir: "ltr" },
  { code: "en", intl: "en-US", label: "English", dir: "ltr" },
  { code: "es", intl: "es-ES", label: "Español", dir: "ltr" },
  { code: "de", intl: "de-DE", label: "Deutsch", dir: "ltr" },
  { code: "fr", intl: "fr-FR", label: "Français", dir: "ltr" },
  { code: "it", intl: "it-IT", label: "Italiano", dir: "ltr" },
  { code: "nl", intl: "nl-NL", label: "Nederlands", dir: "ltr" },
  { code: "pl", intl: "pl-PL", label: "Polski", dir: "ltr" },
  { code: "ru", intl: "ru-RU", label: "Русский", dir: "ltr" },
  { code: "uk", intl: "uk-UA", label: "Українська", dir: "ltr" },
  { code: "tr", intl: "tr-TR", label: "Türkçe", dir: "ltr" },
  { code: "ar", intl: "ar-u-nu-latn", label: "العربية", dir: "rtl" },
  { code: "he", intl: "he-IL", label: "עברית", dir: "rtl" },
  { code: "hi", intl: "hi-IN", label: "हिन्दी", dir: "ltr" },
  { code: "zh", intl: "zh-CN", label: "中文 (简体)", dir: "ltr" },
  { code: "zh-TW", intl: "zh-TW", label: "中文 (繁體)", dir: "ltr" },
  { code: "ja", intl: "ja-JP", label: "日本語", dir: "ltr" },
  { code: "ko", intl: "ko-KR", label: "한국어", dir: "ltr" },
  { code: "vi", intl: "vi-VN", label: "Tiếng Việt", dir: "ltr" },
  { code: "th", intl: "th-TH", label: "ไทย", dir: "ltr" },
  { code: "id", intl: "id-ID", label: "Bahasa Indonesia", dir: "ltr" },
  { code: "bg", intl: "bg-BG", label: "Български", dir: "ltr" },
  { code: "cs", intl: "cs-CZ", label: "Čeština", dir: "ltr" },
  { code: "sk", intl: "sk-SK", label: "Slovenčina", dir: "ltr" },
  { code: "sl", intl: "sl-SI", label: "Slovenščina", dir: "ltr" },
  { code: "hr", intl: "hr-HR", label: "Hrvatski", dir: "ltr" },
  { code: "hu", intl: "hu-HU", label: "Magyar", dir: "ltr" },
  { code: "ro", intl: "ro-RO", label: "Română", dir: "ltr" },
  { code: "el", intl: "el-GR", label: "Ελληνικά", dir: "ltr" },
  { code: "lt", intl: "lt-LT", label: "Lietuvių", dir: "ltr" },
  { code: "da", intl: "da-DK", label: "Dansk", dir: "ltr" },
  { code: "sv", intl: "sv-SE", label: "Svenska", dir: "ltr" },
  { code: "no", intl: "nb-NO", label: "Norsk", dir: "ltr" },
  { code: "fi", intl: "fi-FI", label: "Suomi", dir: "ltr" },
];
const DICT = { pt, en, es, de, fr, it, nl, pl, ru, uk, tr, ar, he, hi, zh, "zh-TW": zhTW, ja, ko, vi, th, id, bg, cs, sk, sl, hr, hu, ro, el, lt, da, sv, no, fi };
const KEY = "xln-explorer-lang";
let current = "pt";

export const lang = () => current;
export const intlTag = () => (LANGS.find((l) => l.code === current) || LANGS[0]).intl;

export function t(key, params) {
  let s = DICT[current]?.[key] ?? DICT.en[key] ?? DICT.pt[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
  return s;
}

export function setLang(code) {
  if (!DICT[code]) code = "en";
  current = code;
  try { localStorage.setItem(KEY, code); } catch {}
  const info = LANGS.find((l) => l.code === code);
  document.documentElement.lang = info.intl.split("-u-")[0];
  document.documentElement.dir = info.dir;
}

export function initLang() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  const q = new URLSearchParams(location.search).get("lang");
  const nav = (navigator.languages || [navigator.language || "pt"]).map((l) => {
    const full = String(l).toLowerCase(), c = full.split("-")[0];
    if (c === "zh") return /-(tw|hk|mo|hant)/.test(full) ? "zh-TW" : "zh";
    if (c === "nb" || c === "nn") return "no";
    return c === "iw" ? "he" : c;
  });
  const pick = [q, saved, ...nav].find((c) => c && DICT[c]) || "en";
  setLang(pick);
}
