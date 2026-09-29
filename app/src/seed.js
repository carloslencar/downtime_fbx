'use strict';
const fs = require('fs');
const { pool, meta, setMeta } = require('./db');
const { definirPin } = require('./auth');
const config = require('./config');

// Na primeira inicialização (banco sem nenhum registro) importa os dados do protótipo.
async function importarInicial() {
  if (await meta('dados_iniciais')) return;
  const vazio = (await pool.query('select count(*)::int as n from docs')).rows[0].n === 0;
  if (!vazio || config.dadosIniciais !== 'prototipo') {
    await setMeta('dados_iniciais', vazio ? 'vazio' : 'existente');
    if (vazio) console.log('[seed] base iniciada vazia (DADOS_INICIAIS=vazio)');
    return;
  }
  const seed = JSON.parse(fs.readFileSync(config.seedArquivo, 'utf8'));
  const c = await pool.connect();
  let total = 0;
  try {
    await c.query('begin');
    for (const [col, docs] of Object.entries(seed.colecoes)) {
      for (const [id, dados0] of Object.entries(docs)) {
        const dados = { ...dados0 };
        if (col === 'usuarios') {
          if (dados.pinHash) {
            await c.query('insert into credenciais (usuario_id, hash) values ($1, $2) on conflict do nothing', [id, 'sha256$' + dados.pinHash]);
          }
          delete dados.pinHash;
        }
        await c.query('insert into docs (colecao, id, dados, atualizado_por) values ($1, $2, $3, $4) on conflict do nothing',
          [col, id, dados, 'importacao']);
        total++;
        if (col === 'log' && id === 'feed') {
          for (const e of dados.eventos || []) {
            const hor = Number(e.hor);
            await c.query(
              `insert into eventos (t_ms, tag, status, acao, por, detalhe, horimetro, dados)
               values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing`,
              [Math.round(e.t), e.tag || '', e.status || null, e.acao || '', e.por || null, e.detalhe || null,
                e.hor != null && Number.isFinite(hor) ? hor : null, e]);
          }
        }
      }
    }
    await c.query("insert into meta (chave, valor) values ('dados_iniciais', 'prototipo') on conflict (chave) do update set valor = excluded.valor");
    await c.query('commit');
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
  console.log(`[seed] ${total} registros importados do protótipo`);
}

// ADMIN_PIN: recupera o acesso do administrador (cria ou reativa e troca o PIN).
async function recuperarAdmin() {
  if (!config.adminPin) return;
  if (!/^\d{4}$/.test(config.adminPin)) { console.warn('[admin] ADMIN_PIN precisa ter 4 números; ignorado'); return; }
  const mat = String(config.adminMatricula).replace(/[^A-Za-z0-9]/g, '') || '10001';
  const id = 'u' + mat;
  const r = await pool.query("select dados from docs where colecao = 'usuarios' and id = $1", [id]);
  const dados = r.rowCount ? { ...r.rows[0].dados, perfil: 'admin', ativo: true }
    : { id, nome: 'Administrador do sistema', curto: 'Admin', matricula: mat, perfil: 'admin', especialidade: '', ativo: true, atualizadoEm: Date.now() };
  await pool.query(
    `insert into docs (colecao, id, dados, atualizado_por) values ('usuarios', $1, $2, 'ADMIN_PIN')
     on conflict (colecao, id) do update set dados = excluded.dados, versao = docs.versao + 1, atualizado_em = now(), atualizado_por = 'ADMIN_PIN'`,
    [id, dados]);
  await definirPin(id, config.adminPin);
  console.log(`[admin] PIN do administrador matrícula ${mat} definido pela variável ADMIN_PIN. Remova a variável depois de entrar.`);
}

module.exports = { importarInicial, recuperarAdmin };
