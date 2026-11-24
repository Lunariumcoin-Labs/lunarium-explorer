// Indexer thread: its own database connection, so writes never block the site/API.
import { parentPort, workerData } from "node:worker_threads";
import { openDb } from "./db.mjs";
import { createRpc } from "./rpc.mjs";
import { createIndexer } from "./indexer.mjs";

const { dbPath, rpc: rpcCfg, batchBlocks } = workerData;
const db = openDb(dbPath);
const rpc = createRpc(rpcCfg);
const log = (m) => parentPort.postMessage({ type: "log", msg: m });
const ix = createIndexer({ db, rpc, batchBlocks, log });

parentPort.on("message", (m) => {
  if (m?.type === "stop") { ix.stop(); setTimeout(() => { try { db.close(); } catch {} process.exit(0); }, 500); }
});

ix.run({ onTip: () => parentPort.postMessage({ type: "tip" }) });
