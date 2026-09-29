#!/bin/sh
# Restaura um backup do banco. Uso: ./scripts/restaurar.sh backups/downtime-AAAAMMDD-HHMM.dump
# ATENÇÃO: substitui todos os dados atuais pelos do arquivo.
set -eu
ARQ="${1:-}"
if [ -z "$ARQ" ] || [ ! -f "$ARQ" ]; then
  echo "Uso: $0 backups/downtime-AAAAMMDD-HHMM.dump"; exit 1
fi
printf "Isto vai substituir TODOS os dados atuais por %s. Digite SIM para continuar: " "$ARQ"
read -r resp
[ "$resp" = "SIM" ] || { echo "Cancelado."; exit 1; }
docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists --no-owner -U downtime -d downtime < "$ARQ"
docker compose start app
echo "Backup restaurado. Recarregue as telas (TVs e celulares)."
