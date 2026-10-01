'use strict';
const { EventEmitter } = require('events');
const { pool } = require('./db');
const { definirPin } = require('./auth');
const regras = require('./regras');

const mudancas = new EventEmitter();
mudancas.setMaxListeners(0);

const FEED_MAX = 40;
const ORDENAVEIS = new Set(['inicio', 't', 'atualizadoEm']);

// O que sai do servidor nunca leva PIN nem hash.
function publico(col, dados) {
  if (!dados) return dados;
  if (col === 'usuarios') { const { pinHash, pin, ...resto } = dados; return resto; }
  return dados;
}

async function listar(col, { ordem, dir, limite, de, ate } = {}) {
  const params = [col];
  let sql = 'select id, dados, versao from docs where colecao = $1';
  if (col === 'paradas' && (de != null || ate != null)) {
    if (de != null) { params.push(de); sql += ` and (dados->>'inicio')::bigint >= $${params.length}`; }
    if (ate != null) { params.push(ate); sql += ` and (dados->>'inicio')::bigint <= $${params.length}`; }
  }
  if (ordem && ORDENAVEIS.has(ordem)) {
    sql += ` order by (dados->>'${ordem}')::numeric ${dir === 'asc' ? 'asc' : 'desc'} nulls last, id`;
  } else sql += ' order by id';
  if (limite) { params.push(Math.min(5000, Math.max(1, Number(limite) || 1))); sql += ` limit $${params.length}`; }
  const r = await pool.query(sql, params);
  return r.rows.map(x => ({ id: x.id, data: publico(col, x.dados), v: x.versao }));
}

async function ler(col, id) {
  const r = await pool.query('select dados, versao from docs where colecao = $1 and id = $2', [col, id]);
  return r.rowCount ? { id, data: publico(col, r.rows[0].dados), v: r.rows[0].versao } : null;
}

function chaveEvento(e) { return `${e.t}|${e.tag || ''}|${e.acao || ''}`; }

// Junta o feed recebido com o que já está no banco: duas telas gravando ao mesmo tempo
// não apagam o evento uma da outra.
function mesclarFeed(atual, recebido) {
  const mapa = new Map();
  for (const e of [...(atual || []), ...(recebido || [])]) {
    if (e && typeof e === 'object' && Number.isFinite(Number(e.t))) mapa.set(chaveEvento(e), e);
  }
  return [...mapa.values()].sort((a, b) => b.t - a.t).slice(0, FEED_MAX);
}

class ErroRegra extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

async function contarUsuarios(c) {
  const r = await c.query(
    `select count(*) filter (where coalesce((dados->>'ativo')::boolean, true)) as ativos,
            count(*) filter (where coalesce((dados->>'ativo')::boolean, true) and dados->>'perfil' = 'admin') as admins
       from docs where colecao = 'usuarios'`);
  return { ativos: Number(r.rows[0].ativos), admins: Number(r.rows[0].admins) };
}

/**
 * Grava (op 'set') ou remove (op 'delete') um documento, conferindo as regras.
 * Retorna { id, data, v } do documento resultante (data null quando removido).
 */
async function gravar({ usuario, col, id, op, dados }) {
  const c = await pool.connect();
  let resultado, eraNovo = false;
  try {
    await c.query('begin');
    // Trava por documento: gravações simultâneas no mesmo registro ficam em fila.
    await c.query('select pg_advisory_xact_lock(hashtext($1))', [col + '/' + id]);
    const atualR = await c.query('select dados, versao from docs where colecao = $1 and id = $2', [col, id]);
    const anterior = atualR.rowCount ? atualR.rows[0].dados : null;
    eraNovo = !anterior;

    let novo = op === 'set' ? { ...dados } : null;
    let pin = null;
    if (col === 'usuarios' && novo) {
      if (novo.pin != null && novo.pin !== '') pin = String(novo.pin);
      delete novo.pin; delete novo.pinHash;
      novo.id = id;
    }
    let contagem = { ativos: 1, admins: 1 };
    if (col === 'usuarios') contagem = await contarUsuarios(c);

    const neg = regras.verificar({
      usuario, col, id, op, anterior, novo,
      adminsAtivos: contagem.admins, haUsuarios: contagem.ativos > 0
    });
    if (neg) throw new ErroRegra(neg.status, neg.mensagem);

    if (col === 'usuarios' && op === 'set') {
      if (pin != null && !/^\d{4}$/.test(pin)) throw new ErroRegra(400, 'O PIN precisa ter 4 números.');
      const temPin = (await c.query('select 1 from credenciais where usuario_id = $1', [id])).rowCount > 0;
      if (!pin && !temPin) throw new ErroRegra(400, 'Informe o PIN de 4 números.');
    }

    // Cada parada ganha um número sequencial (Parada nº 123), usado pela manutenção e pelo planejamento.
    if (col === 'paradas' && op === 'set') {
      if (anterior && anterior.numero) novo.numero = anterior.numero;
      else if (!Number.isInteger(novo.numero)) novo.numero = Number((await c.query("select nextval('paradas_numero') as n")).rows[0].n);
    }
    // Peças: o número da parada e o equipamento vêm sempre da parada (não do aparelho).
    if (col === 'pecas' && op === 'set') {
      novo.id = id;
      const par = await c.query("select dados from docs where colecao = 'paradas' and id = $1", [novo.paradaId]);
      if (!par.rowCount) throw new ErroRegra(400, 'Parada não encontrada para esta peça.');
      novo.tag = par.rows[0].dados.tag;
      if (par.rows[0].dados.numero) novo.numero = par.rows[0].dados.numero;
    }

    if (col === 'log' && id === 'feed') {
      const recebidos = novo.eventos;
      novo = { ...novo, eventos: mesclarFeed(anterior && anterior.eventos, recebidos) };
      for (const e of recebidos) {
        if (!e || !Number.isFinite(Number(e.t))) continue;
        const hor = Number(e.hor);
        await c.query(
          `insert into eventos (t_ms, tag, status, acao, por, detalhe, horimetro, dados)
           values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (t_ms, tag, acao) do nothing`,
          [Math.round(Number(e.t)), String(e.tag || ''), e.status || null, String(e.acao || ''), e.por || null,
            e.detalhe || null, Number.isFinite(hor) && e.hor !== null && e.hor !== '' ? hor : null, e]);
      }
    }

    const uid = usuario ? usuario.id : null;
    if (op === 'set') {
      const r = await c.query(
        `insert into docs (colecao, id, dados, versao, atualizado_em, atualizado_por) values ($1, $2, $3, 1, now(), $4)
         on conflict (colecao, id) do update set dados = excluded.dados, versao = docs.versao + 1,
           atualizado_em = now(), atualizado_por = excluded.atualizado_por
         returning versao`, [col, id, novo, uid]);
      if (pin) await definirPin(id, pin, c);
      if (col === 'usuarios' && novo.ativo === false) await c.query('delete from sessoes where usuario_id = $1', [id]);
      resultado = { id, data: publico(col, novo), v: r.rows[0].versao };
    } else {
      await c.query('delete from docs where colecao = $1 and id = $2', [col, id]);
      if (col === 'usuarios') {
        await c.query('delete from credenciais where usuario_id = $1', [id]);
        await c.query('delete from sessoes where usuario_id = $1', [id]);
      }
      resultado = { id, data: null, v: 0 };
    }
    if (col !== 'log') {
      await c.query('insert into historico (colecao, doc_id, operacao, usuario_id, dados) values ($1, $2, $3, $4, $5)',
        [col, id, op, uid, op === 'set' ? publico(col, novo) : null]);
    }
    await c.query('commit');
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally { c.release(); }
  mudancas.emit('mudanca', { col, ...resultado });
  if (col === 'pecas' && op === 'set') agendarConferencia(resultado.data.paradaId, usuario, eraNovo ? id : null);
  return resultado;
}

/* ---------- Peças: o status do equipamento acompanha a lista de peças ----------
   Depois de qualquer gravação de peça, o servidor confere a parada (uma vez, mesmo que
   várias peças sejam gravadas em sequência):
   - há peças pendentes e o equipamento está "em manutenção"  -> "peças solicitadas";
   - nenhuma peça pendente e o equipamento está em "peças solicitadas" -> volta para "em manutenção";
   - peças novas numa solicitação já aberta -> evento "Peças adicionadas" (avisa o planejamento). */
const PERFIL_NOME = { operacao: 'Operação', manutencao: 'Manutenção', planejador: 'Planejamento', admin: 'Administrador' };
const conferencias = new Map();
let filaConferencia = Promise.resolve();

function agendarConferencia(paradaId, usuario, novaPeca) {
  if (!paradaId) return;
  const c = conferencias.get(paradaId) || { novas: [], usuario: null, t: null };
  if (novaPeca) c.novas.push(novaPeca);
  c.usuario = usuario || c.usuario;
  clearTimeout(c.t);
  c.t = setTimeout(() => {
    conferencias.delete(paradaId);
    filaConferencia = filaConferencia.then(() => conferirPecas(paradaId, c)).catch(e => console.error('[pecas]', e));
  }, 400);
  conferencias.set(paradaId, c);
}

async function conferirPecas(paradaId, { novas, usuario }) {
  const parR = await ler('paradas', paradaId);
  if (!parR) return;
  const par = parR.data;
  const eqR = await ler('equipamentos', par.tag);
  if (!eqR) return;
  const eq = eqR.data;
  const itens = (await pool.query("select dados from docs where colecao = 'pecas' and dados->>'paradaId' = $1", [paradaId])).rows.map(r => r.dados);
  const ativos = itens.filter(i => !i.cancelada);
  const pendentes = ativos.filter(i => !i.chegou);
  const daParada = eq.paradaId === paradaId;
  const quem = usuario ? `${PERFIL_NOME[usuario.perfil] || usuario.perfil} · ${usuario.curto || usuario.nome || ''}` : 'Sistema';
  const nomeLista = l => l.slice(0, 3).map(i => `${i.qtd || 1}× ${i.descricao}`).join(', ') + (l.length > 3 ? ` +${l.length - 3}` : '');
  const now = Date.now();
  const n = par.numero ? `Parada nº ${par.numero}` : 'Parada';

  let novoStatus = null, acao = '', detalhe = '';
  if (daParada && pendentes.length && eq.status === 'em_manutencao') {
    novoStatus = 'aguardando_peca'; acao = 'Peças solicitadas';
    detalhe = `${n} · ${pendentes.length} ${pendentes.length > 1 ? 'itens' : 'item'}: ${nomeLista(pendentes)}`;
  } else if (daParada && !pendentes.length && eq.status === 'aguardando_peca') {
    novoStatus = 'em_manutencao';
    const chegaram = ativos.filter(i => i.chegou).length;
    acao = chegaram ? 'Peças recebidas' : 'Solicitação de peças cancelada';
    detalhe = chegaram ? `${n} · ${chegaram} ${chegaram > 1 ? 'itens chegaram' : 'item chegou'} · atendimento retomado` : `${n} · atendimento retomado`;
  }

  const eventos = [];
  if (novoStatus) {
    const antes = { ...eq }; delete antes.anterior; delete antes.ultAcao;
    const novoEq = { ...antes, status: novoStatus, desde: now, anterior: antes,
      ultAcao: { a: novoStatus === 'aguardando_peca' ? 'pecas' : 'pecas_ok', t: now, papel: 'sistema', uid: '', nome: usuario ? usuario.curto || '' : '' } };
    const novaPar = { ...par, etapas: [...(par.etapas || []), { status: novoStatus, t: now, por: quem }] };
    await gravar({ usuario, col: 'equipamentos', id: eq.tag, op: 'set', dados: novoEq });
    await gravar({ usuario, col: 'paradas', id: paradaId, op: 'set', dados: novaPar });
    eventos.push({ t: now, tag: eq.tag, status: novoStatus, acao, por: quem, detalhe });
  } else if (novas.length && eq.status === 'aguardando_peca' && daParada) {
    const l = itens.filter(i => novas.includes(i.id));
    if (l.length) eventos.push({ t: now, tag: eq.tag, status: 'aguardando_peca', acao: 'Peças adicionadas', por: quem, detalhe: `${n} · ${nomeLista(l)}` });
  }
  if (eventos.length) {
    const feed = await ler('log', 'feed');
    await gravar({ usuario, col: 'log', id: 'feed', op: 'set', dados: { eventos: [...eventos, ...((feed && feed.data.eventos) || [])] } });
  }
}

// Paradas importadas ou antigas sem número recebem um, na ordem em que começaram.
async function numerarParadas() {
  await pool.query(`
    with sem as (
      select id, row_number() over (order by (dados->>'inicio')::bigint, id) as rn
        from docs where colecao = 'paradas' and not (dados ? 'numero')
    ), base as (select coalesce(max((dados->>'numero')::int), 0) as m from docs where colecao = 'paradas' and dados ? 'numero')
    update docs d set dados = jsonb_set(d.dados, '{numero}', to_jsonb(base.m + sem.rn))
      from sem, base where d.colecao = 'paradas' and d.id = sem.id`);
  await pool.query(`select setval('paradas_numero', greatest(1, coalesce((select max((dados->>'numero')::int) from docs where colecao = 'paradas'), 0)),
    (select count(*) > 0 from docs where colecao = 'paradas' and dados ? 'numero'))`);
}

module.exports = { listar, ler, gravar, mesclarFeed, publico, mudancas, ErroRegra, contarUsuarios, numerarParadas, conferirPecas, aguardarConferencias: () => filaConferencia };
