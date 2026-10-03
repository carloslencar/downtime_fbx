# Imagem do backup diário (usada no Coolify, onde o script não pode ser montado do repositório).
FROM postgres:16-alpine
COPY backup.sh /backup.sh
ENTRYPOINT ["/bin/sh", "/backup.sh"]
