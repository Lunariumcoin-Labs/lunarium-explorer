// Teste ponta a ponta do registro de apelido com uma chave DESCARTÁVEL:
// assina como a carteira faz (signmessage) e envia ao explorador, que confere no node (verifymessage).
//   node tools/claim-test.mjs <url-do-explorador> <banco-de-teste.db>
// Precisa de @noble/curves só para o teste: NOBLE_FROM=<pasta com node_modules/@noble/curves> (padrão: pasta atual).
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(`${(process.env.NOBLE_FROM || process.cwd()).replace(/\\/g, "/")}/package.json`);
const { secp256k1 } = require("@noble/curves/secp256k1");
const [BASE, DBFILE] = [process.argv[2] || "http://127.0.0.1:8796", process.argv[3]];

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const sha = (b) => crypto.createHash("sha256").update(b).digest();
function b58check(p) { const f = Buffer.concat([p, sha(sha(p)).subarray(0, 4)]); let n = BigInt("0x" + f.toString("hex")), s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const x of f) { if (x === 0) s = "1" + s; else break; } return s; }
const varstr = (s) => { const b = Buffer.from(s, "utf8"); return Buffer.concat([Buffer.from([b.length]), b]); };
function signMessage(priv, msg) {
  const h = sha(sha(Buffer.concat([varstr("DarkNet Signed Message:\n"), varstr(msg)])));
  const sig = secp256k1.sign(h, priv);
  return Buffer.concat([Buffer.from([27 + sig.recovery + 4]), Buffer.from(sig.toCompactRawBytes())]).toString("base64");
}

const priv = secp256k1.utils.randomPrivateKey();
const pub = Buffer.from(secp256k1.getPublicKey(priv, true));
const address = b58check(Buffer.concat([Buffer.from([48]), crypto.createHash("ripemd160").update(sha(pub)).digest()]));
const other = b58check(Buffer.concat([Buffer.from([48]), crypto.createHash("ripemd160").update(sha(Buffer.from(secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey(), true)))).digest()]));

// o endereço descartável precisa "existir" no banco de teste (como se tivesse uma transação)
const db = new DatabaseSync(DBFILE);
db.prepare("INSERT OR IGNORE INTO addresses (address, first_height, last_height, tx_count) VALUES (?, 1, 1, 1)").run(address);
db.prepare("INSERT OR IGNORE INTO addresses (address, first_height, last_height, tx_count) VALUES (?, 1, 1, 1)").run(other);
db.close();

async function claim(body) {
  const r = await fetch(BASE + "/api/v1/claim", { method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 teste" }, body: JSON.stringify(body) });
  return r.json();
}
const cases = [
  ["apelido válido", { address, name: "Nave Teste 01", signature: signMessage(priv, "Nave Teste 01") }, (r) => r.ok && r.name === "Nave Teste 01"],
  ["assinatura de outro texto", { address, name: "Outro Nome", signature: signMessage(priv, "Nave Teste 01") }, (r) => r.code === "signature_invalid"],
  ["endereço de outra pessoa", { address: other, name: "Roubado", signature: signMessage(priv, "Roubado") }, (r) => r.code === "signature_invalid"],
  ["nome imitando o projeto", { address, name: "Lunarium Suporte", signature: signMessage(priv, "Lunarium Suporte") }, (r) => r.code === "name_reserved"],
  ["nome com link", { address, name: "ganhe em site.com", signature: signMessage(priv, "ganhe em site.com") }, (r) => r.code === "name_link"],
  ["nome já usado por outro", { address: other, name: "nave teste 01", signature: "x".repeat(88) }, (r) => r.code === "signature_format" || r.code === "name_taken"],
  ["endereço inválido", { address: "Lxxxx", name: "abc", signature: signMessage(priv, "abc") }, (r) => r.code === "address_invalid"],
  ["remover (mensagem vazia)", { address, name: "", signature: signMessage(priv, "") }, (r) => r.ok && r.removed],
];
let fails = 0;
for (const [label, body, check] of cases) {
  const r = await claim(body);
  const ok = check(r);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FALHOU"} ${label} → ${JSON.stringify(r).slice(0, 140)}`);
}
// depois do válido, o nome aparece em /names e na busca
await claim({ address, name: "Nave Teste 01", signature: signMessage(priv, "Nave Teste 01") });
const names = await (await fetch(BASE + "/api/v1/names")).json();
const search = await (await fetch(BASE + "/api/v1/search?q=" + encodeURIComponent("nave teste"))).json();
const okNames = names.names[address]?.name === "Nave Teste 01" && search.id === address;
if (!okNames) fails++;
console.log(`${okNames ? "OK  " : "FALHOU"} aparece na lista de apelidos e na busca por nome`);
const mint = names.names["LRdqugAgypEzDVyp1cJ86bwDrNW12BDefT"];
console.log(`${mint?.official ? "OK  " : "FALHOU"} rótulo oficial do mint: ${JSON.stringify(mint)}`);
if (!mint?.official) fails++;
console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO CERTO");
