// Endereços XLN: o core mostra P2PKH com prefixo 75 ("X") abaixo do bloco 1.280.000 e com prefixo 48 ("L")
// a partir dele (chainparams.cpp: nAddressPrefixV2ActivationHeight). É o MESMO endereço (mesmo hash);
// o explorador guarda e mostra sempre a forma "L". P2SH (78) não mudou.
import crypto from "node:crypto";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MAP = new Map([...B58].map((c, i) => [c, BigInt(i)]));
const sha = (b) => crypto.createHash("sha256").update(b).digest();

export const P2PKH_LEGACY = 75; // 'X'
export const P2PKH = 48;        // 'L'
export const P2SH = 78;

export function b58decodeCheck(s) {
  let n = 0n;
  for (const c of s) { const v = MAP.get(c); if (v === undefined) return null; n = n * 58n + v; }
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let buf = Buffer.from(hex === "0" ? "" : hex, "hex");
  let zeros = 0;
  for (const c of s) { if (c === "1") zeros++; else break; }
  if (zeros) buf = Buffer.concat([Buffer.alloc(zeros), buf]);
  if (buf.length < 5) return null;
  const body = buf.subarray(0, -4);
  if (!sha(sha(body)).subarray(0, 4).equals(buf.subarray(-4))) return null;
  return body;
}

export function b58encodeCheck(body) {
  const full = Buffer.concat([body, sha(sha(body)).subarray(0, 4)]);
  let n = BigInt("0x" + (full.toString("hex") || "0"));
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of full) { if (b === 0) s = "1" + s; else break; }
  return s;
}

const cache = new Map();
/** Forma canônica ("L…") de um endereço; devolve o próprio texto se não for P2PKH legado. */
export function canonicalAddress(a) {
  if (!a || a[0] !== "X") return a;
  const c = cache.get(a);
  if (c) return c;
  const body = b58decodeCheck(a);
  let out = a;
  if (body && body.length === 21 && body[0] === P2PKH_LEGACY) out = b58encodeCheck(Buffer.concat([Buffer.from([P2PKH]), body.subarray(1)]));
  if (cache.size > 200000) cache.clear();
  cache.set(a, out);
  return out;
}

/** Forma antiga ("X…") de um endereço L, só para mostrar como referência. */
export function legacyAddress(a) {
  const body = a && a[0] === "L" ? b58decodeCheck(a) : null;
  if (!body || body.length !== 21 || body[0] !== P2PKH) return null;
  return b58encodeCheck(Buffer.concat([Buffer.from([P2PKH_LEGACY]), body.subarray(1)]));
}

/** Endereço com formato e soma de verificação válidos (L, X ou P2SH). */
export function isValidAddress(a) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{26,35}$/.test(a || "")) return false;
  const body = b58decodeCheck(a);
  return !!body && body.length === 21 && [P2PKH, P2PKH_LEGACY, P2SH].includes(body[0]);
}
