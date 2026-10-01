# Arquitetura

```
 celulares / TVs ──HTTP──► proxy (Caddy :80/:443) ──► app (Node.js :3000) ──► db (PostgreSQL 16)
                                                                         ▲
                                                           backup (pg_dump diário)
```

## Servidor (`app/src`)

| Arquivo | Papel |
|---------|-------|
| `server.js` | HTTP: arquivos das telas, API REST, login, tempo real (Server-Sent Events em `/api/stream`) |
| `docs.js` | leitura e gravação dos registros, histórico de eventos e trilha de auditoria |
| `regras.js` | quem pode gravar o quê (conferido em toda gravação) |
| `auth.js` | PIN com scrypt, sessões por cookie (sem expiração; saem com "Sair" ou ao bloquear o usuário) |
| `relatorios.js` | CSV das views para o Power Query e código M pronto |
| `seed.js` | importação do protótipo na primeira inicialização e recuperação do administrador |
| `db.js` | conexão, migrações (`sql/0*.sql`), views (`sql/views.sql`) e usuário somente leitura |

Dependência externa única: `pg` (driver do PostgreSQL).

## Dados

Cada registro é um documento JSON na tabela `docs`, identificado por `(colecao, id)`:

| Coleção | Id | Conteúdo |
|---------|----|----------|
| `equipamentos` | TAG (`ADT-01`) | frota, tipo, porte, modelo, área, horímetro, situação atual, parada em andamento, último lançamento |
| `paradas` | `TAG_inicioMs` | número sequencial (`numero`), responsáveis `[{tecnico,de,t,por,nota}]` (transferências), motivo, observação, técnico, início, fim, horímetros, etapas `[{status,t,por}]`, correções `[{t,por,just,campo,de,para}]`, cancelada |
| `pecas` | `idDaParada_p…` | peça solicitada: paradaId, número da parada, TAG, descrição, código, quantidade, quem pediu, ordem de compra (`oc`), chegada (`chegou`, `chegouEm`, `chegouPor`), cancelada |
| `usuarios` | `u` + matrícula | nome, nome curto, matrícula, perfil (`operacao`, `manutencao`, `planejador`, `admin`), ativo |
| `config` | `frotas`, `areas`, `opcoes` | frotas do painel, áreas, opções do horímetro e do QR code |
| `log` | `feed` | 40 eventos mais recentes mostrados no painel |

Tabelas de apoio: `credenciais` (hash do PIN), `sessoes`, `eventos` (histórico completo de lançamentos),
`historico` (cada gravação com o usuário que fez), `meta` (chave de relatórios, controle da importação),
`migracoes`.

Situações de um equipamento: `operando` › `aguardando` › `em_manutencao` › `aguardando_peca` (Peças solicitadas)
› `aguardando_entrega` (Aguardando peças) › `pecas_recebidas` (Peças recebidas) › `em_manutencao` › `liberado` › `operando`.

As situações de peças são definidas pelo servidor (`docs.js`, conferência das peças) depois de cada gravação de peça:
peça pendente sem ordem de compra → `aguardando_peca`; todas as pendentes com OC → `aguardando_entrega`; nenhuma
pendente e alguma chegou → `pecas_recebidas` (o técnico é limpo e um mecânico precisa assumir); todas canceladas →
volta para `em_manutencao`. Ordem de compra e chegada só são gravadas pelo planejamento ou pelo administrador (`regras.js`).

## API

| Método e caminho | Uso |
|------------------|-----|
| `GET /api/docs/:colecao` | lista (`?ordem=inicio&dir=desc&limite=500`, paradas também `&de=ms&ate=ms`) |
| `GET /api/docs/:colecao/:id` | um registro |
| `PUT /api/docs/:colecao/:id` | grava (exige login e cabeçalho `X-DT: 1`) |
| `DELETE /api/docs/:colecao/:id` | remove |
| `GET /api/stream` | tempo real: `event: ola` na conexão, depois uma mensagem por mudança |
| `POST /api/login` `{id, pin}` · `POST /api/sair` · `GET /api/sessao` | sessão |
| `GET /api/relatorios` (administrador) | chave, links e código M |
| `GET /api/relatorios/:tabela.csv?chave=` | CSV para Power Query |
| `GET /api/saude` | verificação de funcionamento |

Leituras não exigem login (as TVs só leem). Gravações exigem sessão; o PIN nunca sai do servidor.

## Telas (`app/public`)

Página única (`index.html`) com `css/app.css`, `js/i18n.js` (português/inglês), `js/dados.js`
(tipos, motivos, frotas padrão), `js/cliente.js` (conexão com o servidor, cópia local e fila offline)
e `js/app.js` (painel, lançamentos, cadastro, usuários, configurações, dados, QR code, retrato JPEG).
Fontes e a biblioteca de QR code são servidas localmente, então nada depende da internet.
