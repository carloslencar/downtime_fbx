# HTTPS

O sistema sobe em **HTTP** por padrão. Funciona em qualquer celular sem instalar nada, e é o
recomendado até a TI definir o nome e o certificado.

## O que se ganha com HTTPS

- Tráfego criptografado (PIN e dados não circulam abertos no Wi-Fi).
- "Copiar QR code" como imagem funciona em todos os navegadores.
- Possibilidade futura de instalar o sistema como app na tela inicial do celular.

## O que **não** fazer

Não use certificado "autoassinado" nem uma autoridade interna que não esteja instalada nos celulares:
cada aparelho mostraria alerta de segurança até alguém instalar o certificado nele, e com a rotação de
pessoal isso não é viável. As duas opções abaixo usam certificados que os celulares já reconhecem.

## Opção 1: certificado da empresa (`MODO=https-certificado`)

Serve quando a empresa já tem um certificado válido publicamente, por exemplo um curinga
`*.suaempresa.com.br`.

1. A TI cria no DNS interno o nome, por exemplo `downtime.suaempresa.com.br`, apontando para o IP do servidor.
2. Copie para `caddy/certs/`:
   - `certificado.pem`: certificado + cadeia intermediária (em PEM)
   - `chave.pem`: chave privada
3. No `.env`:
   ```
   MODO=https-certificado
   SITE_ENDERECO=downtime.suaempresa.com.br
   ```
4. `docker compose up -d`
5. Em **Configurações › Link de acesso** coloque `https://downtime.suaempresa.com.br` e gere o cartaz do QR code de novo.

Quando o certificado vencer, troque os arquivos e rode `docker compose restart proxy`.

## Opção 2: Let's Encrypt por DNS (`MODO=https-dns`)

Certificado gratuito e renovado automaticamente, **sem** expor o servidor à internet. Precisa de um
domínio público da empresa cujo DNS tenha API (Cloudflare, Route 53, Azure DNS e outros) e de um
token com permissão para criar registros TXT.

1. A TI cria no DNS interno `downtime.suaempresa.com.br` apontando para o IP do servidor.
2. Se o provedor não for Cloudflare, troque o módulo em `caddy/dns/Dockerfile` e a linha `dns` em
   `caddy/https-dns.Caddyfile` (lista: https://caddyserver.com/docs/modules/ , procure `dns.providers`).
3. No `.env`:
   ```
   MODO=https-dns
   SITE_ENDERECO=downtime.suaempresa.com.br
   COMPOSE_FILE=docker-compose.yml:docker-compose.dns.yml
   ACME_EMAIL=ti@suaempresa.com.br
   DNS_API_TOKEN=token-do-provedor
   ```
4. `docker compose up -d --build` (o servidor precisa de saída para a internet nesse momento, para
   baixar o módulo e pedir o certificado).
5. Atualize o **Link de acesso** e o cartaz do QR code, como na opção 1.

## Voltar para HTTP

`MODO=http` no `.env` (e comente `COMPOSE_FILE`, se usou a opção 2), depois `docker compose up -d`.
