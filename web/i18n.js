// Explorer languages: the same 10 as the Lunarium V5 wallet.
import pt from "./i18n/pt.js";
import en from "./i18n/en.js";
import es from "./i18n/es.js";
import ar from "./i18n/ar.js";
import zh from "./i18n/zh.js";
import ru from "./i18n/ru.js";
import ja from "./i18n/ja.js";
import he from "./i18n/he.js";
import hi from "./i18n/hi.js";
import it from "./i18n/it.js";

export const LANGS = [
  { code: "pt", intl: "pt-BR", label: "Português", dir: "ltr" },
  { code: "en", intl: "en-US", label: "English", dir: "ltr" },
  { code: "es", intl: "es-ES", label: "Español", dir: "ltr" },
  { code: "ar", intl: "ar-u-nu-latn", label: "العربية", dir: "rtl" },
  { code: "zh", intl: "zh-CN", label: "中文", dir: "ltr" },
  { code: "ru", intl: "ru-RU", label: "Русский", dir: "ltr" },
  { code: "ja", intl: "ja-JP", label: "日本語", dir: "ltr" },
  { code: "he", intl: "he-IL", label: "עברית", dir: "rtl" },
  { code: "hi", intl: "hi-IN", label: "हिन्दी", dir: "ltr" },
  { code: "it", intl: "it-IT", label: "Italiano", dir: "ltr" },
];
const DICT = { pt, en, es, ar, zh, ru, ja, he, hi, it };
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
  const nav = (navigator.languages || [navigator.language || "pt"]).map((l) => String(l).toLowerCase().split("-")[0]).map((c) => (c === "iw" ? "he" : c));
  const pick = [q, saved, ...nav].find((c) => c && DICT[c]) || "en";
  setLang(pick);
}
