# LunariumCoin Explorer

<p>
  <a href="https://galaxia.lunariumcoin.com/?coin=xln"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgalaxia.lunariumcoin.com%2Fapi%2Fv1%2Fcoins%2Fxln&query=%24.data.market_cap_usd&prefix=%24&label=market%20cap&color=1f6feb&cacheSeconds=1800" alt="XLN market cap (live)"/></a>
  <a href="https://galaxia.lunariumcoin.com/?coin=xln"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgalaxia.lunariumcoin.com%2Fapi%2Fv1%2Fcoins%2Fxln&query=%24.data.price_usd&prefix=%24&label=price&color=1f6feb&cacheSeconds=1800" alt="XLN price (live)"/></a>
  <br/><sub>Live data from the <a href="https://galaxia.lunariumcoin.com/?coin=xln">GaláxiaLunarium</a> aggregator</sub>
</p>

The official LunariumCoin (XLN) block explorer, live at [explorerxln.com](https://explorerxln.com): its own indexer, API and website in a single Node.js process with no external dependencies (SQLite built into Node ≥ 22.13).

## How it works

- **Dedicated node** (`lunarium-explorer-node.service`): `lunariumcoind` with `txindex=1`, RPC on 127.0.0.1:13987 only, no open P2P port.
- **Indexer** (`server/indexer.mjs`, in its own thread): reads the chain block by block over batched RPC and stores blocks, transactions, outputs, addresses and each address's history with the balance after every transaction. It detects reorgs and rolls back to the common point.
- **Addresses**: the core shows P2PKH with the `X` prefix below block 1,280,000 and `L` from that block on (same hash). The explorer always stores and shows the `L` form (`server/address.mjs`).
- **Issuance audit** (`server/api.mjs`): for every block, new coins ≤ `GetBlockValue(height)` (+ fees in PoW blocks, + the 47M mint at block 1,275,000, the height the network accepted), the same rule as `ConnectBlock`. The supply is also cross-checked against the node's own `gettxoutsetinfo` at the same height.
- **New API** at `/api/v1/*` (XLN values as strings with 8 decimals) and **full eIquidus compatibility** at `/api/*` and `/ext/*` (`server/compat.mjs`): the Android app, the rewards portal and GaláxiaLunarium keep working unchanged. `tools/compat-diff.mjs` compares the answers with the previous explorer.
- **Address aliases**: owners claim a name by signing it with their wallet (`signmessage`); the node verifies the signature (`verifymessage`). Official team labels carry a verified badge.
- **Website** (`web/`): no framework and no build step; 34 languages (the same as GaláxiaLunarium), with hreflang alternates for search engines, original vector artwork (astronaut, planets, canvas galaxy), live updates over SSE.
- **Visitor counter**: no cookies and no stored IP addresses; only the country is derived from the IP.

## Server layout

| Item | Location |
|---|---|
| Code | `/opt/lunarium-explorer` (previous versions in `/opt/lunarium-explorer-releases`) |
| Database | `/var/lib/lunarium-explorer/data/explorer.db` |
| Node | `/var/lib/lunarium-explorer/node` |
| Configuration | `/etc/lunarium-explorer/{rpc,explorer}.env` (never committed) |
| Services | `lunarium-explorer.service` (127.0.0.1:8795), `lunarium-explorer-node.service` |

Deploy: `bash tools/deploy.sh` (SSH host in `EXPLORER_SSH_HOST`). Tests: `npm test`.

## Environment variables

| Variable | Purpose |
|---|---|
| `XLN_RPC_URL`, `XLN_RPC_USER`, `XLN_RPC_PASS` | Node RPC connection |
| `EXPLORER_DB` | SQLite database path |
| `EXPLORER_HOST`, `EXPLORER_PORT` | HTTP listen address |
| `EXPLORER_BATCH` | Blocks per batch during the initial sync |
| `EXPLORER_PRICE_URL` | Price source (GaláxiaLunarium API), optional |
| `EXPLORER_PUBLIC_URL` | Public site URL |
| `EXPLORER_LABELS` | Official address labels file (`{"address": "name"}`) |
| `EXPLORER_RATE_LIMIT`, `EXPLORER_RATE_EXEMPT` | API requests per minute per IP, and IPs exempt from it |
| `EXPLORER_HIDE_PEERS` | Peer IPs hidden from the public network page |
| `EXPLORER_INDEXER` | `0` serves the API/site without indexing |

## License

[MIT](LICENSE) © 2026 Lunariumcoin Labs. The flags in `web/assets/flags/` come from the flag-icons project, also MIT (`web/assets/flags/LICENSE.txt`).
