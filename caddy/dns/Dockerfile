# Caddy com módulo de DNS para emitir certificado Let's Encrypt sem expor o servidor à internet.
# Troque "cloudflare" pelo módulo do seu provedor: https://caddyserver.com/docs/modules/ (dns.providers.*)
FROM caddy:2-builder-alpine AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
