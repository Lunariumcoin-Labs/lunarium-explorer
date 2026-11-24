// Configuration from environment variables (on the server they come from /etc/lunarium-explorer/*.env via systemd).
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;

export const config = {
  root,
  webDir: path.join(root, "web"),
  rpc: {
    url: env.XLN_RPC_URL || "http://127.0.0.1:13987",
    user: env.XLN_RPC_USER || "",
    pass: env.XLN_RPC_PASS || "",
  },
  dbPath: env.EXPLORER_DB || path.join(root, "data", "explorer.db"),
  host: env.EXPLORER_HOST || "127.0.0.1",
  port: Number(env.EXPLORER_PORT || 8795),
  // Blocks per batch during the initial sync.
  batchBlocks: Number(env.EXPLORER_BATCH || 40),
  // Public site URL (absolute links, sitemap).
  publicUrl: env.EXPLORER_PUBLIC_URL || "https://explorerxln.com",
  // Price: the official API that GaláxiaLunarium already consolidates (highest price across exchanges). Optional.
  priceUrl: env.EXPLORER_PRICE_URL || "",
  // Official address labels (JSON {"address": "name"}), re-read every 5 minutes.
  labelsFile: env.EXPLORER_LABELS || "/etc/lunarium-explorer/labels.json",
  // false = serve the API/site only, without indexing (useful for local tests with a copied database).
  indexer: env.EXPLORER_INDEXER !== "0",
};
