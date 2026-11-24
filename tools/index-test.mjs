// Indexer test: syncs up to the given height into a throwaway database and shows the speed.
//   node --env-file=<rpc.env> tools/index-test.mjs <banco.db> <altura-final>
import { openDb } from "../server/db.mjs";
import { createRpc } from "../server/rpc.mjs";
import { createIndexer } from "../server/indexer.mjs";

const [dbFile, until] = [process.argv[2], Number(process.argv[3] || 5000)];
const db = openDb(dbFile);
const rpc = createRpc({ url: process.env.XLN_RPC_URL, user: process.env.XLN_RPC_USER, pass: process.env.XLN_RPC_PASS });
const ix = createIndexer({ db, rpc, batchBlocks: Number(process.env.EXPLORER_BATCH || 100), log: () => {} });

const t0 = Date.now();
let start = ix.tip() ?? -1;
while ((ix.tip() ?? -1) < until) {
  const n = await ix.step();
  if (n === 0) break;
  const h = ix.tip();
  if (h % 5000 < 100) console.log(`bloco ${h}  ${((h - start) / ((Date.now() - t0) / 1000)).toFixed(0)} blocos/s`);
}
const h = ix.tip();
console.log(`fim: bloco ${h} em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const s = db.prepare("SELECT (SELECT COUNT(*) FROM txs) AS txs, (SELECT COUNT(*) FROM addresses) AS addrs, (SELECT SUM(value) FROM outputs WHERE spent_tx IS NULL) AS utxo, (SELECT SUM(minted) FROM blocks) AS minted").get();
console.log(JSON.stringify(s));
