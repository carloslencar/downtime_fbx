# Hospedar no Coolify

O sistema tem três containers (banco, aplicação e backup), então no Coolify ele entra como **Docker Compose**,
usando o arquivo `docker-compose.coolify.yml` da raiz do repositório. O Coolify cuida do domínio e do HTTPS.

## Antes

- O nome (ex.: `downtime.suaempresa.com`) precisa apontar para o IP do servidor do Coolify (registro A no DNS).
- As portas 80 e 443 do servidor precisam estar abertas (o Coolify usa as duas para o HTTPS automático).

## Passo a passo

1. Em **Projects › (seu projeto) › + New › Public/Private Repository**, escolha `carloslencar/downtime_fbx`, branch `main`.
2. Em **Build Pack**, escolha **Docker Compose** (não Nixpacks nem Dockerfile).
3. **Base Directory:** `/` · **Docker Compose Location:** `/docker-compose.coolify.yml`. Salve.
4. Na lista de serviços que aparece, no serviço **app**, coloque o domínio com `https://`, por exemplo
   `https://downtime.suaempresa.com`. Os serviços **db** e **backup** ficam sem domínio.
5. Em **Environment Variables** (opcional), ajuste:
   - `DADOS_INICIAIS=vazio` para começar sem os dados de exemplo (precisa ser **antes** do primeiro deploy);
   - `TZ` (padrão `America/Manaus`), `BACKUP_HORA`, `BACKUP_DIAS`, `RELATORIOS_CHAVE`.
   A senha do banco (`SERVICE_PASSWORD_POSTGRES`) é gerada pelo Coolify; não troque depois do primeiro deploy.
6. Clique em **Deploy**. Em um ou dois minutos o sistema abre no domínio, já com HTTPS.

## Observações

- **Tempo real:** se as telas não atualizarem sozinhas (precisa recarregar para ver as mudanças), desligue a compressão
  gzip do Coolify para este recurso (Advanced › Gzip) e faça o deploy de novo.
- **Backups:** ficam no volume `backups` do servidor. O próprio Coolify também faz backup de bancos, mas este banco está
  dentro do compose; mantenha o serviço `backup` ligado.
- **Recuperar o administrador:** defina `ADMIN_PIN` nas variáveis, faça o deploy, entre e depois apague a variável.
- **Power BI direto no banco** (porta 5432) não fica exposto no Coolify; use os links de relatório (aba Dados).
