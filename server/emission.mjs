// Mirrors EXACTLY the core issuance rule (src/masternode.cpp: GetBlockValue)
// and the one-time mint (src/chainparams.cpp: nXLNCoinSupplyMintHeight / nXLNCoinSupply), mainnet.
// Any change to these rules in the core must be copied here too.

const COIN = 1; // we work in whole XLN here, not satoshis

// REAL mint height on the network: block 1,275,000 paid 47,000,000 XLN to the mint address and the network accepted it.
// (The chainparams.cpp published on GitHub used to say 1,270,000 — not what the network binary uses; fixed since.)
export const MINT_HEIGHT = 1275000;
export const MINT_AMOUNT = 47000000 * COIN;

export function blockValue(h) {
  if (h > 6928901) return 1 * COIN;
  if (h > 4826501) return 2 * COIN;
  if (h > 2724101) return 5 * COIN;
  if (h > 621701) return 10 * COIN;
  if (h > 340000) return 12 * COIN;
  if (h > 14400) return 12 * COIN;
  if (h > 1) return 1 * COIN;
  if (h > 0) return 51000000 * COIN;
  return 50 * COIN; // genesis
}

// Closed-form sum per segment (fast even at large heights, no block-by-block loop).
// [minHeightExclusive, maxHeightInclusive, valuePerBlock] — the two 12 XLN brackets in the code (>340000
// and >14400) pay the same value, so here they become one continuous segment.
const RANGE_SEGMENTS = [
  [1, 14400, 1],
  [14400, 621701, 12],
  [621701, 2724101, 10],
  [2724101, 4826501, 5],
  [4826501, 6928901, 2],
  [6928901, Infinity, 1],
];

/** Expected cumulative supply up to (and including) height H, by the pure code rule, without fees. */
export function expectedSupply(H) {
  let total = 0;
  if (H >= 1) total += 51000000; // block 1 (premine), a special case in the code
  for (const [lo, hi, val] of RANGE_SEGMENTS) {
    if (H <= lo) break;
    const upper = Math.min(H, hi);
    const count = Math.max(0, upper - lo);
    total += count * val;
  }
  if (H >= MINT_HEIGHT) total += MINT_AMOUNT;
  return total;
}
