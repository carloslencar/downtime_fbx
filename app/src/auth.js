'use strict';
const crypto = require('crypto');
const { pool } = require('./db');

// PIN guardado com scrypt (hash forte, com sal). Hashes do protótipo (sha256) são aceitos
// uma vez e trocados por scrypt no primeiro login.
const N = 16384, R = 8, P = 1, TAM = 32;

function scrypt(pin, sal) {
  return new Promise((ok, erro) => crypto.scrypt(String(pin), sal, TAM, { N, r: R, p: P }, (e, k) => e ? erro(e) : ok(k)));
}

async function gerarHash(pin) {
  const sal = crypto.randomBytes(16);
  const k = await scrypt(pin, sal);
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${k.toString('base64')}`;
}

function iguais(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function conferir(usuarioId, pin, hash) {
  if (!hash) return { ok: false };
  if (hash.startsWith('scrypt$')) {
    const [, n, r, p, sal, k] = hash.split('$');
    const alvo = Buffer.from(k, 'base64');
    const calc = await new Promise((ok, erro) => crypto.scrypt(String(pin), Buffer.from(sal, 'base64'), alvo.length,
      { N: Number(n), r: Number(r), p: Number(p) }, (e, x) => e ? erro(e) : ok(x)));
    return { ok: iguais(calc, alvo) };
  }
  if (hash.startsWith('sha256$')) {
    const calc = crypto.createHash('sha256').update(usuarioId + ':' + pin).digest();
    const ok = iguais(calc, Buffer.from(hash.slice(7), 'hex'));
    return { ok, atualizar: ok };
  }
  return { ok: false };
}

async function definirPin(usuarioId, pin, cliente = pool) {
  const h = await gerarHash(pin);
  await cliente.query(
    `insert into credenciais (usuario_id, hash, atualizado_em) values ($1, $2, now())
     on conflict (usuario_id) do update set hash = excluded.hash, atualizado_em = now()`, [usuarioId, h]);
}

async function login(usuarioId, pin) {
  const u = await pool.query("select dados from docs where colecao = 'usuarios' and id = $1", [usuarioId]);
  if (!u.rowCount || u.rows[0].dados.ativo === false) return null;
  const c = await pool.query('select hash from credenciais where usuario_id = $1', [usuarioId]);
  const r = await conferir(usuarioId, pin, c.rowCount ? c.rows[0].hash : '');
  if (!r.ok) return null;
  if (r.atualizar) await definirPin(usuarioId, pin);
  return u.rows[0].dados;
}

function hashToken(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }

async function criarSessao(usuarioId, agente) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query('insert into sessoes (token_hash, usuario_id, agente) values ($1, $2, $3)',
    [hashToken(token), usuarioId, String(agente || '').slice(0, 200)]);
  return token;
}

async function encerrarSessao(token) {
  if (token) await pool.query('delete from sessoes where token_hash = $1', [hashToken(token)]);
}

// Devolve o usuário da sessão (ou null). Usuário bloqueado ou removido perde a sessão.
async function usuarioDaSessao(token) {
  if (!token) return null;
  const r = await pool.query(
    `select s.usuario_id, d.dados, s.ultimo_uso < now() - interval '1 hour' as velho
       from sessoes s left join docs d on d.colecao = 'usuarios' and d.id = s.usuario_id
      where s.token_hash = $1`, [hashToken(token)]);
  if (!r.rowCount) return null;
  const { dados, velho, usuario_id } = r.rows[0];
  if (!dados || dados.ativo === false) {
    await pool.query('delete from sessoes where usuario_id = $1', [usuario_id]);
    return null;
  }
  if (velho) pool.query('update sessoes set ultimo_uso = now() where token_hash = $1', [hashToken(token)]).catch(() => {});
  return { id: usuario_id, ...dados };
}

module.exports = { gerarHash, conferir, definirPin, login, criarSessao, encerrarSessao, usuarioDaSessao, hashToken };
