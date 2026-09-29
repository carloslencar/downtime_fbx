#!/bin/sh
# Backup diário do banco (pg_dump) em ./backups, guardando os últimos BACKUP_DIAS dias.
# Backup na hora:  docker compose exec backup sh /backup.sh agora
set -u
HORA="${BACKUP_HORA:-02:30}"
DIAS="${BACKUP_DIAS:-30}"
DESTINO=/backups

fazer_backup() {
  arq="$DESTINO/downtime-$(date +%Y%m%d-%H%M).dump"
  if pg_dump -Fc -f "$arq.tmp"; then
    mv "$arq.tmp" "$arq"
    echo "[backup] $(date '+%Y-%m-%d %H:%M') gravado $arq ($(du -h "$arq" | cut -f1))"
  else
    rm -f "$arq.tmp"
    echo "[backup] $(date '+%Y-%m-%d %H:%M') FALHOU" >&2
  fi
  find "$DESTINO" -name 'downtime-*.dump' -type f -mtime +"$DIAS" -exec rm -f {} \;
}

mkdir -p "$DESTINO"
if [ "${1:-}" = "agora" ]; then fazer_backup; exit 0; fi

echo "[backup] agendado todos os dias às $HORA, guardando $DIAS dias"
ultimo=""
while true; do
  agora=$(date +%H:%M)
  hoje=$(date +%Y%m%d)
  if [ "$agora" = "$HORA" ] && [ "$ultimo" != "$hoje" ]; then
    fazer_backup
    ultimo="$hoje"
  fi
  sleep 30
done
