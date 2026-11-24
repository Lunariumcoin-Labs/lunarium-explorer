#!/usr/bin/env bash
# Envia o código para o servidor (host SSH em EXPLORER_SSH_HOST) e reinicia o serviço do explorador.
# O banco (/var/lib/lunarium-explorer/data) e a configuração (/etc/lunarium-explorer) não são tocados.
set -euo pipefail
HOST="${EXPLORER_SSH_HOST:-lunarium-painel-vps}"
cd "$(dirname "$0")/.."
node --check server/index.mjs
for f in server/*.mjs web/*.js web/i18n/*.js; do node --check "$f" 2>/dev/null || { echo "erro de sintaxe em $f"; node --check "$f"; exit 1; }; done
TMP=$(mktemp -t lx.XXXXXX.tgz)
tar --exclude=data --exclude=node_modules --exclude=.claude -czf "$TMP" package.json server web tools
scp -q -o BatchMode=yes "$TMP" "$HOST:/tmp/lunarium-explorer.tgz"
rm -f "$TMP"
ssh -o BatchMode=yes "$HOST" 'set -e
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p /opt/lunarium-explorer-releases
[ -d /opt/lunarium-explorer/server ] && tar -czf /opt/lunarium-explorer-releases/antes-$STAMP.tgz -C /opt/lunarium-explorer . || true
ls -1t /opt/lunarium-explorer-releases/antes-*.tgz 2>/dev/null | tail -n +11 | xargs -r rm -f
rm -rf /opt/lunarium-explorer.new && mkdir -p /opt/lunarium-explorer.new
tar -xzf /tmp/lunarium-explorer.tgz -C /opt/lunarium-explorer.new && rm -f /tmp/lunarium-explorer.tgz
chown -R root:root /opt/lunarium-explorer.new && chmod -R a+rX /opt/lunarium-explorer.new
rm -rf /opt/lunarium-explorer.old; mv /opt/lunarium-explorer /opt/lunarium-explorer.old; mv /opt/lunarium-explorer.new /opt/lunarium-explorer
systemctl restart lunarium-explorer
sleep 4
systemctl is-active lunarium-explorer
curl -fsS http://127.0.0.1:8795/healthz; echo'
