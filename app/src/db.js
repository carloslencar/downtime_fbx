'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl || undefined,
  max: 10,
  idleTimeoutMillis: 30000
});
pool.on('error', err => console.error('[db] erro na conexão ociosa:', err.message));

const SQL_DIR = path.join(__dirname, '..', 'sql');
const VIEWS = ['vw_frotas', 'vw_equipamentos', 'vw_paradas', 'vw_etapas', 'vw_correcoes', 'vw_eventos', 'vw_usuarios', 'vw_pecas', 'vw_oficinas', 'vw_leituras', 'vw_preventivas', 'vw_preventivas_agendadas'];

async function esperarBanco(tentativas = 30) {
  for (let i = 1; ; i++) {
    try { await pool.query('select 1'); return; } catch (e) {
      if (i >= tentativas) throw e;
      console.log(`[db] aguardando o banco (${i}/${tentativas}): ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function migrar() {
  const c = await pool.connect();
  try {
    await c.query('select pg_advisory_lock(727001)');
    await c.query('create table if not exists migracoes (nome text primary key, em timestamptz not null default now())');
    const feitas = new Set((await c.query('select nome from migracoes')).rows.map(r => r.nome));
    const arquivos = fs.readdirSync(SQL_DIR).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
    for (const f of arquivos) {
      if (feitas.has(f)) continue;
      console.log(`[db] aplicando ${f}`);
      await c.query('begin');
      try {
        await c.query(fs.readFileSync(path.join(SQL_DIR, f), 'utf8'));
        await c.query('insert into migracoes (nome) values ($1)', [f]);
        await c.query('commit');
      } catch (e) { await c.query('rollback'); throw e; }
    }
    // Fuso horário do banco: usado nas views e nas conexões do Power Query.
    const db = (await c.query('select current_database() as n')).rows[0].n;
    await c.query(`alter database ${ident(db)} set timezone to ${lit(config.tz)}`);
    await c.query(`set timezone to ${lit(config.tz)}`);
    await c.query(fs.readFileSync(path.join(SQL_DIR, 'views.sql'), 'utf8'));
    try { await usuarioRelatorios(c); }
    catch (e) { console.warn(`[db] não foi possível preparar o usuário de relatórios: ${e.message}`); }
  } finally {
    await c.query('select pg_advisory_unlock(727001)').catch(() => {});
    c.release();
  }
}

// Usuário somente leitura para Power Query / Power BI (opcional).
async function usuarioRelatorios(c) {
  const nome = config.pqUsuario, senha = config.pqSenha;
  if (!senha) return;
  const existe = (await c.query('select 1 from pg_roles where rolname = $1', [nome])).rowCount > 0;
  await c.query(`${existe ? 'alter' : 'create'} role ${ident(nome)} with login password ${lit(senha)}`);
  const db = (await c.query('select current_database() as n')).rows[0].n;
  await c.query(`grant connect on database ${ident(db)} to ${ident(nome)}`);
  await c.query(`grant usage on schema public to ${ident(nome)}`);
  await c.query(`revoke all on all tables in schema public from ${ident(nome)}`);
  await c.query(`grant select on ${VIEWS.join(', ')} to ${ident(nome)}`);
  await c.query(`alter role ${ident(nome)} set timezone to ${lit(config.tz)}`);
}

function ident(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
function lit(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

async function meta(chave, valorPadrao) {
  const r = await pool.query('select valor from meta where chave = $1', [chave]);
  if (r.rowCount) return r.rows[0].valor;
  if (valorPadrao === undefined) return null;
  await pool.query('insert into meta (chave, valor) values ($1, $2) on conflict (chave) do nothing', [chave, valorPadrao]);
  return (await pool.query('select valor from meta where chave = $1', [chave])).rows[0].valor;
}
async function setMeta(chave, valor) {
  await pool.query('insert into meta (chave, valor) values ($1, $2) on conflict (chave) do update set valor = excluded.valor', [chave, valor]);
}

module.exports = { pool, esperarBanco, migrar, meta, setMeta, VIEWS };
