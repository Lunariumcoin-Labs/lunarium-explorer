// Apelidos de endereço (alias). Dois tipos:
//  - "claim": o dono prova que o endereço é dele assinando o apelido na carteira (signmessage) e o node confere
//    (verifymessage). Assinar uma mensagem VAZIA remove o apelido — igual ao /claim do eIquidus.
//  - "official": rótulos da equipe (arquivo labels.json no servidor), com selo de verificado. Têm prioridade.
import fs from "node:fs";
import crypto from "node:crypto";
import { canonicalAddress, isValidAddress } from "./address.mjs";

// Rótulos oficiais que vêm do próprio código do core (não dependem de arquivo).
const BUILTIN_OFFICIAL = {
  LRdqugAgypEzDVyp1cJ86bwDrNW12BDefT: "Mint 47M · bloco 1.275.000", // sXLNCoinSupplyMintAddress (chainparams.cpp); mint aceito pela rede no bloco 1.275.000 sXLNCoinSupplyMintAddress
};

// Nomes que imitam o projeto ou a equipe ficam para os rótulos oficiais (evita golpe por imitação).
const RESERVED = /lunarium|xlnft|\bxln\b|oficial|official|admin|suporte|support|equipe|\bteam\b|\bdev\b|desenvolvedor|developer|moderador|moderator|\bmint\b|explorer|exchange|binance|airdrop|giveaway|sorteio|staff/i;
const NAME_OK = /^[\p{L}\p{N}][\p{L}\p{N} ._\-&'()#]{0,30}[\p{L}\p{N})]$|^[\p{L}\p{N}]$/u;

export class AliasError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function normalizeName(raw) {
  return String(raw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

export function validateName(name) {
  if (name.length < 2 || name.length > 32) throw new AliasError("name_length", "o apelido precisa ter de 2 a 32 caracteres");
  if (!NAME_OK.test(name)) throw new AliasError("name_chars", "use só letras, números, espaço e . _ - & ' ( ) #");
  if (/https?|www\.|\.[a-z]{2,6}\b|@|\/\/|t\.me/i.test(name)) throw new AliasError("name_link", "o apelido não pode ter links ou domínios");
  if (RESERVED.test(name)) throw new AliasError("name_reserved", "esse nome é reservado para rótulos oficiais da equipe");
}

export function createAliases({ db, rpc, labelsFile, log = console.log }) {
  db.exec(`CREATE TABLE IF NOT EXISTS address_names (
    address TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_lc TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,          -- 'claim' | 'official'
    updated_at INTEGER NOT NULL
  )`);
  const st = {
    all: db.prepare("SELECT address, name, kind FROM address_names"),
    byLc: db.prepare("SELECT address FROM address_names WHERE name_lc = ?"),
    get: db.prepare("SELECT name, kind FROM address_names WHERE address = ?"),
    upsert: db.prepare(`INSERT INTO address_names (address, name, name_lc, kind, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(address) DO UPDATE SET name = excluded.name, name_lc = excluded.name_lc, kind = excluded.kind, updated_at = excluded.updated_at`),
    del: db.prepare("DELETE FROM address_names WHERE address = ? AND kind = 'claim'"),
    delOfficial: db.prepare("DELETE FROM address_names WHERE kind = 'official'"),
    hasAddr: db.prepare("SELECT 1 FROM addresses WHERE address = ?"),
  };

  let cache = null;
  function all() {
    if (!cache) {
      cache = {};
      for (const r of st.all.all()) cache[r.address] = { name: r.name, official: r.kind === "official" };
    }
    return cache;
  }
  const nameOf = (address) => all()[address] || null;

  // Rótulos oficiais: código do core + arquivo da equipe (relido a cada 5 min; editar o arquivo basta).
  let labelsMtime = 0;
  function loadOfficial() {
    let fileLabels = {};
    try {
      const stt = fs.statSync(labelsFile);
      if (stt.mtimeMs === labelsMtime && labelsMtime) return;
      labelsMtime = stt.mtimeMs;
      fileLabels = JSON.parse(fs.readFileSync(labelsFile, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") log(`labels.json inválido: ${e.message}`);
      if (labelsMtime === -1) return;
      labelsMtime = -1;
    }
    const merged = { ...BUILTIN_OFFICIAL, ...fileLabels };
    db.exec("BEGIN");
    try {
      st.delOfficial.run();
      const now = Math.floor(Date.now() / 1000);
      for (const [addr, name] of Object.entries(merged)) {
        const a = canonicalAddress(addr);
        const n = normalizeName(name);
        if (!isValidAddress(a) || !n) continue;
        // um rótulo oficial toma o lugar de um apelido igual de outro endereço
        db.prepare("DELETE FROM address_names WHERE name_lc = ? AND address <> ?").run(n.toLowerCase(), a);
        st.upsert.run(a, n, n.toLowerCase(), "official", now);
      }
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); log(`rótulos oficiais: ${e.message}`); }
    cache = null;
  }
  loadOfficial();
  setInterval(loadOfficial, 5 * 60000).unref();

  // limite de tentativas: 12 por 10 minutos por origem (hash do IP, só em memória)
  const salt = crypto.randomBytes(16).toString("hex");
  const tries = new Map();
  function allow(ip) {
    const k = crypto.createHash("sha256").update(salt + ip).digest("hex").slice(0, 16);
    const now = Date.now();
    let t = tries.get(k);
    if (!t || now - t.start > 600000) { t = { start: now, n: 0 }; tries.set(k, t); }
    if (tries.size > 20000) tries.clear();
    return ++t.n <= 12;
  }

  async function claim({ address, name, signature, ip }) {
    if (!allow(ip)) throw new AliasError("rate", "muitas tentativas; espere alguns minutos");
    const raw = String(address || "").trim();
    if (!isValidAddress(raw)) throw new AliasError("address_invalid", "endereço inválido");
    const a = canonicalAddress(raw);
    const sig = String(signature || "").trim();
    if (!/^[A-Za-z0-9+/=]{80,100}$/.test(sig)) throw new AliasError("signature_format", "a assinatura não está no formato da carteira");
    const n = normalizeName(name);
    const current = st.get.get(a);
    if (current?.kind === "official") throw new AliasError("official", "este endereço tem um rótulo oficial da equipe");
    if (n) {
      validateName(n);
      const owner = st.byLc.get(n.toLowerCase());
      if (owner && owner.address !== a) throw new AliasError("name_taken", "esse apelido já pertence a outro endereço");
    }
    if (!st.hasAddr.get(a)) throw new AliasError("address_unused", "esse endereço ainda não tem nenhuma transação na rede");
    // a assinatura vale para o texto exato que o dono assinou (o nome como digitado, sem os espaços das pontas)
    const signed = String(name ?? "").trim();
    let ok = false;
    for (const candidate of new Set([a, raw])) {
      try { if (await rpc.call("verifymessage", candidate, sig, signed)) { ok = true; break; } } catch {}
    }
    if (!ok) throw new AliasError("signature_invalid", "a assinatura não confere com este endereço e este apelido");
    if (!n) { st.del.run(a); cache = null; return { ok: true, address: a, name: null, removed: true }; }
    st.upsert.run(a, n, n.toLowerCase(), "claim", Math.floor(Date.now() / 1000));
    cache = null;
    log(`apelido registrado: ${a} → ${n}`);
    return { ok: true, address: a, name: n };
  }

  function search(q) {
    const lc = normalizeName(q).toLowerCase();
    if (lc.length < 2) return null;
    const exact = st.byLc.get(lc);
    if (exact) return exact.address;
    for (const [addr, v] of Object.entries(all())) if (v.name.toLowerCase().includes(lc)) return addr;
    return null;
  }

  return { all, nameOf, claim, search };
}
