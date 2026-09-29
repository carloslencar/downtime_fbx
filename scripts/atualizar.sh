#!/bin/sh
# Atualiza o sistema com a versão mais nova do GitHub, fazendo um backup antes.
set -eu
cd "$(dirname "$0")/.."
docker compose exec -T backup sh /backup.sh agora || echo "Aviso: backup antes da atualização não foi feito."
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true
echo "Atualizado. As telas recarregam sozinhas em alguns segundos ou ao atualizar a página."
