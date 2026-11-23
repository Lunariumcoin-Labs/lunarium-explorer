// Configuração por variáveis de ambiente (no servidor vêm de /etc/lunarium-explorer/*.env via systemd).
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
  // Quantos blocos por lote durante a sincronização inicial.
  batchBlocks: Number(env.EXPLORER_BATCH || 40),
  // Endereço público do site (links absolutos, sitemap).
  publicUrl: env.EXPLORER_PUBLIC_URL || "https://explorerxln.com",
  // Preço: API oficial que o GaláxiaLunarium já consolida (maior preço entre as exchanges). Opcional.
  priceUrl: env.EXPLORER_PRICE_URL || "",
  // false = só serve a API/site sem indexar (útil para testes locais com banco copiado).
  indexer: env.EXPLORER_INDEXER !== "0",
};
