# LunariumCoin Explorer

Explorador de blocos oficial da LunariumCoin (XLN): indexador próprio, API e site, num processo Node.js sem dependências externas (SQLite embutido no Node ≥ 22.13).

## Como funciona

- **Node dedicado** (`lunarium-explorer-node.service`): `lunariumcoind` com `txindex=1`, RPC só em 127.0.0.1:13987, sem porta P2P aberta.
- **Indexador** (`server/indexer.mjs`, numa thread própria): lê bloco a bloco por RPC em lotes, grava blocos, transações, saídas, endereços e o histórico com saldo após cada transação. Detecta reorg e desfaz até o ponto em comum.
- **Endereços**: o core mostra P2PKH com prefixo `X` abaixo do bloco 1.280.000 e `L` a partir dele (mesmo hash). O explorador guarda e mostra sempre a forma `L` (`server/address.mjs`).
- **Auditoria da emissão** (`server/api.mjs`): para cada bloco, moedas novas ≤ `GetBlockValue(altura)` (+ taxas em PoW, + mint de 47M no bloco 1.275.000, a altura que a rede aceitou), a mesma regra do `ConnectBlock`. Também confere a oferta com `gettxoutsetinfo` do próprio node na mesma altura.
- **API nova** em `/api/v1/*` (valores em XLN como texto com 8 casas) e **compatibilidade total com o eIquidus** em `/api/*` e `/ext/*` (`server/compat.mjs`): app Android, painel de recompensas e GaláxiaLunarium continuam funcionando sem mudança. `tools/compat-diff.mjs` compara as respostas com o explorador antigo.
- **Site** (`web/`): sem framework nem build; 10 idiomas (os mesmos da carteira V5), arte vetorial própria (astronauta, planetas, galáxia em canvas), atualização ao vivo por SSE.

## Servidor (VPS 2)

| Item | Onde |
|---|---|
| Código | `/opt/lunarium-explorer` (versões anteriores em `/opt/lunarium-explorer-releases`) |
| Banco | `/var/lib/lunarium-explorer/data/explorer.db` |
| Node | `/var/lib/lunarium-explorer/node` |
| Configuração | `/etc/lunarium-explorer/{rpc,explorer}.env` |
| Serviços | `lunarium-explorer.service` (127.0.0.1:8795), `lunarium-explorer-node.service` |

Deploy: `bash tools/deploy.sh`. Testes: `npm test`.

## Variáveis

`XLN_RPC_URL`, `XLN_RPC_USER`, `XLN_RPC_PASS`, `EXPLORER_DB`, `EXPLORER_HOST`, `EXPLORER_PORT`, `EXPLORER_BATCH`, `EXPLORER_PRICE_URL` (preço do GaláxiaLunarium), `EXPLORER_PUBLIC_URL`, `EXPLORER_RATE_LIMIT`.
