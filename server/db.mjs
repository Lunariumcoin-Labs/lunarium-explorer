// Banco do explorador (SQLite embutido no Node). Valores sempre em satoshis (1 XLN = 100.000.000).
// Cada linha cabe com folga num Number; somas grandes (oferta total) são lidas como BigInt.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);

CREATE TABLE IF NOT EXISTS blocks (
  height INTEGER PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  prev_hash TEXT,
  time INTEGER NOT NULL,
  size INTEGER,
  tx_count INTEGER,
  kind TEXT,              -- 'pow' | 'pos'
  minted INTEGER,         -- moedas novas do bloco (saídas - entradas de coinbase/coinstake)
  fees INTEGER,           -- taxas das transações comuns
  out_total INTEGER,      -- soma das saídas de todas as transações do bloco
  staker TEXT,            -- quem gerou o bloco (stake ou mineração)
  mn_payee TEXT,          -- masternode pago no bloco
  mn_amount INTEGER,
  difficulty REAL,
  version INTEGER,
  bits TEXT,
  nonce INTEGER,
  merkleroot TEXT
);
CREATE INDEX IF NOT EXISTS blocks_time ON blocks(time);
CREATE INDEX IF NOT EXISTS blocks_mn ON blocks(mn_payee, height);
CREATE INDEX IF NOT EXISTS blocks_staker ON blocks(staker, height);

CREATE TABLE IF NOT EXISTS txs (
  id INTEGER PRIMARY KEY,
  txid TEXT NOT NULL UNIQUE,
  height INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  time INTEGER NOT NULL,
  kind TEXT NOT NULL,     -- 'coinbase' | 'coinstake' | 'normal'
  size INTEGER,
  n_in INTEGER,
  n_out INTEGER,
  value_in INTEGER,
  value_out INTEGER,
  fee INTEGER,
  op_return TEXT
);
CREATE INDEX IF NOT EXISTS txs_height ON txs(height, idx);
CREATE INDEX IF NOT EXISTS txs_value ON txs(value_out) WHERE kind = 'normal';

CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  received INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  tx_count INTEGER NOT NULL DEFAULT 0,
  first_height INTEGER,
  last_height INTEGER
);
CREATE INDEX IF NOT EXISTS addresses_balance ON addresses(balance DESC);

-- Saídas de transação: spent_tx/spent_n apontam para a entrada que a gastou.
CREATE TABLE IF NOT EXISTS outputs (
  tx_id INTEGER NOT NULL,
  n INTEGER NOT NULL,
  addr_id INTEGER,
  value INTEGER NOT NULL,
  type TEXT,
  spent_tx INTEGER,
  spent_n INTEGER,
  spent_height INTEGER,
  PRIMARY KEY (tx_id, n)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS outputs_spent ON outputs(spent_tx, spent_n) WHERE spent_tx IS NOT NULL;
CREATE INDEX IF NOT EXISTS outputs_utxo ON outputs(addr_id) WHERE spent_tx IS NULL;

-- Histórico por endereço, com o saldo logo depois de cada transação.
CREATE TABLE IF NOT EXISTS address_txs (
  addr_id INTEGER NOT NULL,
  height INTEGER NOT NULL,
  tx_id INTEGER NOT NULL,
  received INTEGER NOT NULL,
  sent INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  PRIMARY KEY (addr_id, height, tx_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS address_txs_height ON address_txs(height);
`;

export function openDb(file, { readonly = false } = {}) {
  if (!readonly) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { readOnly: readonly });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -200000; PRAGMA busy_timeout = 10000;");
  if (!readonly) {
    db.exec(SCHEMA);
    const v = db.prepare("SELECT v FROM meta WHERE k = 'schema'").get();
    if (!v) db.prepare("INSERT INTO meta (k, v) VALUES ('schema', ?)").run(String(SCHEMA_VERSION));
  }
  return db;
}

export function getMeta(db, k, fallback = null) {
  const r = db.prepare("SELECT v FROM meta WHERE k = ?").get(k);
  return r ? r.v : fallback;
}
export function setMeta(db, k, v) {
  db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, String(v));
}

// Transação SQL simples (o node:sqlite não tem helper próprio).
export function inTransaction(db, fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
