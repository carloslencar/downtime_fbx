-- Views para relatórios (Power Query, Power BI, SQL).
-- Recriadas a cada inicialização do sistema. Datas no fuso do banco (variável TZ do .env).

create or replace function dt_ts(ms bigint) returns timestamp
  language sql stable as
$$ select case when ms is null then null
               else (to_timestamp(ms / 1000.0) at time zone current_setting('TimeZone'))::timestamp(0) end $$;

create or replace function dt_num(v text) returns numeric
  language sql immutable as
$$ select case when v ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then v::numeric else null end $$;

create or replace function dt_ms(v text) returns bigint
  language sql immutable as
$$ select case when v ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then round(v::numeric)::bigint else null end $$;

create or replace function dt_status(s text) returns text
  language sql immutable as
$$ select case s
    when 'operando'        then 'Operando'
    when 'aguardando'      then 'Aguardando manutenção'
    when 'em_manutencao'   then 'Em manutenção'
    when 'aguardando_peca' then 'Peças solicitadas'
    when 'liberado'        then 'Liberado · aguardando operação'
    when 'correcao'        then 'Correção'
    else s end $$;

create or replace function dt_tipo(s text) returns text
  language sql immutable as
$$ select case s
    when 'adt'            then 'Caminhão articulado'
    when 'escavadeira'    then 'Escavadeira'
    when 'carregadeira'   then 'Pá carregadeira'
    when 'trator'         then 'Trator de esteira'
    when 'motoniveladora' then 'Motoniveladora'
    when 'bomba'          then 'Bomba'
    when 'perfuratriz'    then 'Perfuratriz'
    when 'comboio'        then 'Caminhão comboio'
    else s end $$;

create or replace function dt_perfil(s text) returns text
  language sql immutable as
$$ select case s
    when 'operacao'   then 'Operação'
    when 'manutencao' then 'Manutenção'
    when 'planejador' then 'Planejamento'
    when 'admin'      then 'Administrador'
    else s end $$;

drop view if exists vw_paradas, vw_etapas, vw_correcoes, vw_equipamentos, vw_eventos, vw_usuarios, vw_frotas, vw_pecas cascade;

create view vw_frotas as
select f->>'id'      as frota_id,
       f->>'nome'    as frota,
       f->>'prefixo' as prefixo,
       dt_tipo(f->>'tipo') as tipo,
       nullif(f->>'porte', '') as porte
from docs c, jsonb_array_elements(coalesce(c.dados->'lista', '[]'::jsonb)) f
where c.colecao = 'config' and c.id = 'frotas';

create view vw_equipamentos as
select e.id                           as tag,
       fr.frota                       as frota,
       dt_tipo(e.dados->>'tipo')      as tipo,
       nullif(e.dados->>'porte', '')  as porte,
       nullif(e.dados->>'modelo', '') as modelo,
       nullif(e.dados->>'area', '')   as area,
       dt_num(e.dados->>'ano')::int   as ano,
       dt_num(e.dados->>'horimetro')  as horimetro,
       dt_ts(dt_ms(e.dados->>'horimetroEm')) as horimetro_em,
       dt_status(e.dados->>'status')  as situacao_atual,
       dt_ts(dt_ms(e.dados->>'desde')) as situacao_desde,
       coalesce((e.dados->>'ativo')::boolean, true) as no_painel
from docs e
left join vw_frotas fr on fr.frota_id = e.dados->>'grupo'
where e.colecao = 'equipamentos';

create view vw_paradas as
with p as (
  select d.id,
         d.dados,
         dt_ms(d.dados->>'inicio') as ini,
         dt_ms(d.dados->>'fim')    as fim,
         coalesce((d.dados->>'cancelada')::boolean, false) as cancelada
  from docs d where d.colecao = 'paradas'
)
select p.id                                   as parada_id,
       dt_num(p.dados->>'numero')::int        as numero,
       p.dados->>'tag'                        as tag,
       eq.frota,
       eq.tipo,
       eq.area,
       nullif(p.dados->>'motivo', '')         as motivo,
       nullif(p.dados->>'obs', '')            as observacao,
       dt_ts(p.ini)                           as inicio,
       dt_ts(p.fim)                           as fim,
       round(((coalesce(p.fim, (extract(epoch from now()) * 1000)::bigint) - p.ini) / 3600000.0)::numeric, 2) as duracao_h,
       case when p.cancelada then 'Cancelada' when p.fim is not null then 'Encerrada' else 'Em andamento' end as situacao,
       nullif(p.dados->>'tecnico', '')        as tecnico,
       dt_num(p.dados->>'horIni')             as horimetro_inicio,
       dt_num(p.dados->>'horFim')             as horimetro_fim,
       jsonb_array_length(coalesce(p.dados->'correcoes', '[]'::jsonb)) as correcoes,
       nullif(p.dados->'etapas'->0->>'por', '') as aberta_por,
       (select string_agg(r->>'tecnico', ' → ' order by n)
          from jsonb_array_elements(coalesce(p.dados->'responsaveis', '[]'::jsonb)) with ordinality as x(r, n)) as responsaveis,
       greatest(jsonb_array_length(coalesce(p.dados->'responsaveis', '[]'::jsonb)) - 1, 0) as transferencias
from p
left join vw_equipamentos eq on eq.tag = p.dados->>'tag';

create view vw_etapas as
with e as (
  select d.id as parada_id,
         d.dados->>'tag' as tag,
         dt_ms(d.dados->>'fim') as parada_fim,
         coalesce((d.dados->>'cancelada')::boolean, false) as cancelada,
         s->>'status' as status,
         dt_ms(s->>'t') as t,
         nullif(s->>'por', '') as por,
         n as ordem
  from docs d, jsonb_array_elements(coalesce(d.dados->'etapas', '[]'::jsonb)) with ordinality as x(s, n)
  where d.colecao = 'paradas'
), o as (
  select e.*, lead(t) over (partition by parada_id order by t, ordem) as prox from e
)
select parada_id,
       tag,
       row_number() over (partition by parada_id order by t, ordem) as ordem,
       dt_status(status) as etapa,
       dt_ts(t) as inicio,
       dt_ts(coalesce(prox, parada_fim)) as fim,
       round(((coalesce(prox, parada_fim, (extract(epoch from now()) * 1000)::bigint) - t) / 3600000.0)::numeric, 2) as duracao_h,
       por as registrado_por,
       cancelada as parada_cancelada
from o
where status is distinct from 'operando';

create view vw_correcoes as
select d.id as parada_id,
       d.dados->>'tag' as tag,
       dt_ts(dt_ms(c->>'t')) as data,
       nullif(c->>'por', '') as por,
       nullif(c->>'campo', '') as campo,
       c->>'de' as de,
       c->>'para' as para,
       nullif(c->>'just', '') as justificativa
from docs d, jsonb_array_elements(coalesce(d.dados->'correcoes', '[]'::jsonb)) c
where d.colecao = 'paradas';

create view vw_eventos as
select dt_ts(t_ms) as data,
       tag,
       dt_status(status) as situacao,
       acao,
       por,
       detalhe,
       horimetro
from eventos;

create view vw_usuarios as
select u.dados->>'matricula' as matricula,
       u.dados->>'nome'      as nome,
       u.dados->>'curto'     as nome_curto,
       dt_perfil(u.dados->>'perfil') as perfil,
       coalesce((u.dados->>'ativo')::boolean, true) as ativo
from docs u
where u.colecao = 'usuarios';

create view vw_pecas as
select i.id                                   as item_id,
       dt_num(i.dados->>'numero')::int        as parada_numero,
       i.dados->>'paradaId'                   as parada_id,
       i.dados->>'tag'                        as tag,
       eq.frota,
       i.dados->>'descricao'                  as descricao,
       nullif(i.dados->>'codigo', '')         as codigo,
       dt_num(i.dados->>'qtd')                as quantidade,
       dt_ts(dt_ms(i.dados->>'criadoEm'))     as solicitada_em,
       nullif(i.dados->>'criadoPor', '')      as solicitada_por,
       nullif(i.dados->>'oc', '')             as ordem_compra,
       dt_ts(dt_ms(i.dados->>'ocEm'))         as ordem_compra_em,
       coalesce((i.dados->>'chegou')::boolean, false) as chegou,
       dt_ts(dt_ms(i.dados->>'chegouEm'))     as chegou_em,
       nullif(i.dados->>'chegouPor', '')      as recebida_por,
       round(((coalesce(dt_ms(i.dados->>'chegouEm'), (extract(epoch from now()) * 1000)::bigint) - dt_ms(i.dados->>'criadoEm')) / 3600000.0)::numeric, 2) as espera_h,
       case when coalesce((i.dados->>'cancelada')::boolean, false) then 'Cancelada'
            when coalesce((i.dados->>'chegou')::boolean, false) then 'Chegou'
            when nullif(i.dados->>'oc', '') is not null then 'Com ordem de compra'
            else 'Aguardando ordem de compra' end as situacao
from docs i
left join vw_equipamentos eq on eq.tag = i.dados->>'tag'
where i.colecao = 'pecas';
