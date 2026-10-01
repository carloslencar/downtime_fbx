-- Número sequencial das paradas (Parada nº 123) e índice das solicitações de peças.
create sequence if not exists paradas_numero;
create index if not exists docs_pecas_parada on docs ((dados->>'paradaId')) where colecao = 'pecas';
