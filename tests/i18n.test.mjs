// Todos os idiomas têm todas as frases usadas pelo site, com os mesmos marcadores {x}.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const LANGS = ["pt", "en", "es", "ar", "zh", "ru", "ja", "he", "hi", "it"];
const src = fs.readFileSync(path.join(web, "app.js"), "utf8");
const used = new Set([...src.matchAll(/\bt\("([A-Za-z0-9_]+)"/g)].map((m) => m[1]).filter((k) => !k.endsWith("_")));
for (const k of ["home", "blocks", "masternodes", "richlist", "network", "movement", "supply", "charts", "api"]) used.add("nav_" + k);

const marks = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

for (const code of LANGS) {
  test(`idioma ${code} completo`, async () => {
    const dict = (await import(pathToFileURL(path.join(web, "i18n", code + ".js")).href)).default;
    const pt = (await import(pathToFileURL(path.join(web, "i18n", "pt.js")).href)).default;
    const missing = [...used].filter((k) => !(k in dict));
    assert.deepEqual(missing, [], `faltam em ${code}: ${missing.join(", ")}`);
    for (const k of Object.keys(pt)) {
      if (k in dict) assert.equal(marks(dict[k]), marks(pt[k]), `marcadores diferentes em ${code}.${k}`);
    }
    const extra = Object.keys(dict).filter((k) => !(k in pt));
    assert.deepEqual(extra, [], `chaves a mais em ${code}: ${extra.join(", ")}`);
  });
}
