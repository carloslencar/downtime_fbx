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
  let resultado;
  try {
    await c.query('begin');
    // Trava por documento: gravações simultâneas no mesmo registro ficam em fila.
    await c.query('select pg_advisory_xact_lock(hashtext($1))', [col + '/' + id]);
    const atualR = await c.query('select dados, versao from docs where colecao = $1 and id = $2', [col, id]);
    const anterior = atualR.rowCount ? atualR.rows[0].dados : null;

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
  return resultado;
}

module.exports = { listar, ler, gravar, mesclarFeed, publico, mudancas, ErroRegra, contarUsuarios };
