-- Leituras de horímetro (lançamento diário) e consulta por equipamento.
create index if not exists docs_leituras_tag
  on docs ((dados->>'tag'), ((dados->>'capturadaEm')::bigint))
  where colecao = 'leituras';
