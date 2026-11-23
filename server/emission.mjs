// Espelha EXATAMENTE a regra de emissão do core (src/masternode.cpp: GetBlockValue)
// e o mint único (src/chainparams.cpp: nXLNCoinSupplyMintHeight / nXLNCoinSupply), mainnet.
// Qualquer mudança nessas regras no core precisa ser copiada aqui também.

const COIN = 1; // já trabalhamos em XLN "inteiro", não em satoshis

// Altura REAL do mint na rede: o bloco 1.275.000 pagou 47.000.000 XLN ao endereço do mint e a rede o aceitou.
// (O chainparams.cpp publicado no GitHub diz 1.270.000 — não é o que o binário da rede usa.)
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

// Soma fechada por segmento (rápido mesmo em alturas grandes, sem precisar de loop bloco a bloco).
// [alturaMinExclusive, alturaMaxInclusive, valorPorBloco] — os dois brackets de 12 do código (>340000
// e >14400) pagam o mesmo valor, então aqui viram um único segmento contínuo.
const RANGE_SEGMENTS = [
  [1, 14400, 1],
  [14400, 621701, 12],
  [621701, 2724101, 10],
  [2724101, 4826501, 5],
  [4826501, 6928901, 2],
  [6928901, Infinity, 1],
];

/** Supply esperada acumulada até (e incluindo) a altura H, pela regra pura do código, sem taxas. */
export function expectedSupply(H) {
  let total = 0;
  if (H >= 1) total += 51000000; // bloco 1 (prêmio inicial), caso especial no código
  for (const [lo, hi, val] of RANGE_SEGMENTS) {
    if (H <= lo) break;
    const upper = Math.min(H, hi);
    const count = Math.max(0, upper - lo);
    total += count * val;
  }
  if (H >= MINT_HEIGHT) total += MINT_AMOUNT;
  return total;
}
