-- Estrutura principal do Quadro de Paradas.
-- Os registros do sistema ficam em "docs" (um JSON por equipamento, parada, usuário etc.).
-- Para relatórios, use as views vw_* (arquivo views.sql), que já entregam colunas prontas.

create table if not exists docs (
  colecao        text        not null,
  id             text        not null,
  dados          jsonb       not null,
  versao         integer     not null default 1,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text,
  primary key (colecao, id)
);

create index if not exists docs_paradas_inicio
  on docs (((dados->>'inicio')::bigint) desc)
  where colecao = 'paradas';

-- PIN de cada usuário, separado dos dados que circulam pela tela.
create table if not exists credenciais (
  usuario_id    text primary key,
  hash          text not null,
  atualizado_em timestamptz not null default now()
);

-- Sessões de login (cookie). Não expiram: saem só com "Sair" ou quando o usuário é bloqueado.
create table if not exists sessoes (
  token_hash text primary key,
  usuario_id text not null,
  criado_em  timestamptz not null default now(),
  ultimo_uso timestamptz not null default now(),
  agente     text
);
create index if not exists sessoes_usuario on sessoes (usuario_id);

-- Histórico completo de eventos do painel (o painel mostra só os 40 mais recentes).
create table if not exists eventos (
  id        bigserial primary key,
  t_ms      bigint  not null,
  tag       text    not null default '',
  status    text,
  acao      text    not null default '',
  por       text,
  detalhe   text,
  horimetro numeric,
  dados     jsonb   not null,
  unique (t_ms, tag, acao)
);
create index if not exists eventos_t on eventos (t_ms desc);

-- Trilha de auditoria: cada gravação feita pelo sistema, com quem fez.
create table if not exists historico (
  id         bigserial primary key,
  em         timestamptz not null default now(),
  colecao    text not null,
  doc_id     text not null,
  operacao   text not null,
  usuario_id text,
  dados      jsonb
);
create index if not exists historico_doc on historico (colecao, doc_id, em desc);

create table if not exists meta (
  chave text primary key,
  valor text not null
);
