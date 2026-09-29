# Quadro de Paradas (downtime_fbx)

Sistema para a **Operação** e a **Manutenção** conversarem sobre equipamentos parados, em tempo real,
nas TVs (sala de controle e oficina) e nos celulares.

- A operação abre a parada, a manutenção assume, marca aguardando peça e libera, e a operação confirma o recebimento.
- Tudo aparece na hora em todas as telas, com a cor do status, o tempo parado e a fila de atendimento.
- Correções e cancelamentos ficam registrados com justificativa; dá para desfazer o último lançamento por 10 minutos.
- O administrador exporta os dados para o Excel e conecta o Power Query direto no servidor.
- Funciona na intranet, sem internet. Quem entra pelo celular só escaneia o QR code: nada para instalar.

## O que roda no servidor

| Serviço  | O que faz |
|----------|-----------|
| `db`     | PostgreSQL 16, onde ficam todos os dados |
| `app`    | Servidor Node.js: telas, API, login e atualização em tempo real |
| `proxy`  | Caddy na porta 80 (e 443 quando o HTTPS for ativado) |
| `backup` | Cópia diária do banco em `./backups`, guardando 30 dias |

## Instalação (servidor Linux)

Pré-requisitos: Docker Engine com o plugin `docker compose` e o Git.

```bash
git clone https://github.com/carloslencar/downtime_fbx.git
cd downtime_fbx
cp .env.example .env
nano .env            # troque DB_SENHA (letras e números)
docker compose up -d --build
```

Na primeira vez o sistema cria o banco e importa os dados do protótipo (42 equipamentos, usuários,
áreas, paradas e eventos). Depois de uns 30 segundos, abra no navegador:

- `http://IP-DO-SERVIDOR/` de qualquer computador ou celular da rede, ou
- `http://downtime/` depois que a TI criar o nome **downtime** no DNS da empresa apontando para o servidor
  (em alguns celulares é preciso o nome completo, por exemplo `http://downtime.suaempresa.local/`).

Para conferir: `docker compose ps` (todos "running"/"healthy") e `docker compose logs -f app`.

### Primeiro acesso

Os usuários do protótipo vêm com o PIN **1234**, exceto quem já tinha trocado. Entre como administrador,
abra a aba **Usuários** e troque o PIN de cada pessoa (ou peça para cada um trocar o seu).

Para começar com o banco vazio em vez dos dados do protótipo, use `DADOS_INICIAIS=vazio` no `.env`
**antes** da primeira inicialização. Nesse caso, o primeiro usuário cadastrado na aba Usuários será o administrador.

### Configurações

Tudo fica no arquivo `.env` (o modelo comentado está em [`.env.example`](.env.example)).
Depois de mudar, rode `docker compose up -d`.

## Uso no dia a dia

- **TVs:** abra o endereço no navegador e clique em **Tela cheia**. Não é preciso entrar com usuário na TV.
  Veja [docs/TV.md](docs/TV.md) para deixar a TV abrindo sozinha ao ligar.
- **Alarme sonoro:** em Configurações › Esta tela, cada TV ou computador liga o seu alarme (nova parada,
  equipamento liberado e lembrete de espera). Detalhes em [docs/TV.md](docs/TV.md).
- **Celulares:** escaneie o QR code (botão **QR code** no topo ou o cartaz em PDF), toque em **Entrar**,
  escolha o nome e digite o PIN. O celular fica conectado até a pessoa tocar em **Sair**.
- **Rede instável:** se o Wi-Fi cair, a TV continua mostrando o último estado com o aviso "Reconectando…", e os
  lançamentos feitos no celular sem sinal ficam guardados e são enviados assim que a conexão volta
  (desde que a página continue aberta).
- **Quem pode o quê:** operação e manutenção fazem o fluxo normal, correções, cadastro de equipamentos e de usuários.
  Só o administrador mexe em administradores, nas **Áreas**, nas configurações que valem para todas as telas e na aba **Dados**.

## Relatórios no Excel (Power Query)

Na aba **Dados** (administrador) escolha a tabela, copie o código e cole no Excel em
*Dados › Obter Dados › De Outras Fontes › Consulta Nula › Editor Avançado*. O botão **Atualizar Tudo**
passa a buscar os dados direto do servidor. Tabelas: Paradas, Etapas, Correções, Equipamentos,
Eventos (histórico completo) e Usuários. Detalhes e a opção de conexão direta ao banco (Power BI) em
[docs/POWER-QUERY.md](docs/POWER-QUERY.md).

## Atualizar o sistema

```bash
cd downtime_fbx
./scripts/atualizar.sh
```

O script faz um backup, baixa a versão nova do GitHub e reconstrói os containers. As telas abertas
recarregam sozinhas quando percebem a versão nova (sem interromper quem estiver no meio de um lançamento).

## Backup e restauração

- Backup automático todo dia às `BACKUP_HORA` (padrão 02:30) em `./backups/downtime-AAAAMMDD-HHMM.dump`,
  guardando `BACKUP_DIAS` dias. Copie essa pasta para outro lugar (servidor de arquivos, nuvem da empresa).
- Backup na hora: `docker compose exec backup sh /backup.sh agora`
- Restaurar: `./scripts/restaurar.sh backups/downtime-AAAAMMDD-HHMM.dump` (substitui os dados atuais; pede confirmação).

## HTTPS

O sistema sobe em HTTP, que funciona em qualquer celular sem instalar nada. Quando a TI liberar um nome
com certificado, o HTTPS é ligado trocando uma linha no `.env` (`MODO=`). Opções e passo a passo em
[docs/HTTPS.md](docs/HTTPS.md).

## Recuperar o acesso de administrador

Se ninguém conseguir entrar como administrador: preencha `ADMIN_PIN=` (4 números) no `.env`, rode
`docker compose up -d`, entre com a matrícula `ADMIN_MATRICULA` (padrão 10001) e depois apague o `ADMIN_PIN`
do `.env` e rode `docker compose up -d` de novo.

## Problemas comuns

| Sintoma | O que fazer |
|---------|-------------|
| Página não abre | `docker compose ps`; confira se a porta 80 está livre (`HTTP_PORTA` no `.env`) e liberada no firewall do servidor |
| "Sem sincronização" / "Reconectando…" fixo | Rede entre a tela e o servidor; veja `docker compose logs app` |
| Tempo real não chega por um proxy da empresa | O canal `/api/stream` precisa passar sem buffer (Server-Sent Events) |
| Esqueci o PIN | Outro usuário (ou o administrador) define um PIN novo na aba Usuários |

## Desenvolvimento

```bash
cd app
npm install
# PostgreSQL local vazio para os testes de ponta a ponta:
DATABASE_URL=postgres://usuario:senha@localhost:5432/teste npm test
# rodar o servidor:
PGHOST=localhost PGUSER=... PGPASSWORD=... PGDATABASE=... npm start
```

Estrutura:

```
app/
  src/        servidor (server.js, docs.js, regras.js, auth.js, relatorios.js, seed.js, db.js)
  sql/        tabelas (001_inicial.sql) e views de relatório (views.sql)
  seed/       dados importados do protótipo
  public/     telas (index.html, css, js, fontes e biblioteca de QR code locais)
  test/       testes (node --test)
caddy/        configurações do proxy (HTTP e HTTPS)
backup/       script do backup diário
scripts/      atualizar.sh e restaurar.sh
docs/         HTTPS, Power Query, TV e arquitetura
```

Arquitetura e modelo de dados: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
