'use strict';
// Teste de ponta a ponta da API. Precisa de um PostgreSQL vazio:
//   DATABASE_URL=postgres://usuario:senha@localhost:5432/banco_de_teste npm test
const test = require('node:test');
const assert = require('node:assert');

const URL_DB = process.env.DATABASE_URL;
test('API com banco', { skip: !URL_DB && 'defina DATABASE_URL para rodar' }, async t => {
  process.env.DADOS_INICIAIS = 'prototipo';
  process.env.RELATORIOS_CHAVE = 'chave-teste';
  const db = require('../src/db');
  const seed = require('../src/seed');
  const { criarServidor } = require('../src/server');
  await db.pool.query('drop schema public cascade; create schema public');
  await db.migrar();
  await seed.importarInicial();
  const srv = criarServidor();
  await new Promise(ok => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  t.after(async () => { srv.closeAllConnections(); srv.close(); await db.pool.end(); });

  const req = async (metodo, caminho, corpo, cookie) => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-DT': '1', ...(cookie ? { Cookie: cookie } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    return { status: r.status, j, txt, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
  };

  await t.test('dados do protótipo importados', async () => {
    const r = await req('GET', '/api/docs/equipamentos');
    assert.equal(r.j.docs.length, 42);
    const u = await req('GET', '/api/docs/usuarios/u10001');
    assert.equal(u.j.data.pinHash, undefined);
  });

  let cOp, cAdm;
  await t.test('login com PIN do protótipo e troca para hash forte', async () => {
    assert.equal((await req('POST', '/api/login', { id: 'u20101', pin: '0000' })).status, 401);
    const r = await req('POST', '/api/login', { id: 'u20101', pin: '1234' });
    assert.equal(r.status, 200); cOp = r.cookie;
    const h = await db.pool.query("select hash from credenciais where usuario_id = 'u20101'");
    assert.match(h.rows[0].hash, /^scrypt\$/);
    assert.equal((await req('POST', '/api/login', { id: 'u20101', pin: '1234' })).status, 200);
    cAdm = (await req('POST', '/api/login', { id: 'u10001', pin: '1234' })).cookie;
    assert.equal((await req('GET', '/api/sessao', null, cOp)).j.usuario.id, 'u20101');
  });

  await t.test('gravação exige login e cabeçalho', async () => {
    assert.equal((await req('PUT', '/api/docs/equipamentos/ADT-01', { tag: 'ADT-01' })).status, 401);
    const r = await fetch(base + '/api/docs/equipamentos/ADT-01', { method: 'PUT', headers: { Cookie: cOp, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403);
  });

  await t.test('abrir parada, feed e histórico de eventos', async () => {
    const eq = (await req('GET', '/api/docs/equipamentos/ADT-01')).j.data;
    const now = Date.now();
    assert.equal((await req('PUT', '/api/docs/equipamentos/ADT-01', { ...eq, status: 'aguardando', paradaId: 'ADT-01_' + now }, cOp)).status, 200);
    assert.equal((await req('PUT', '/api/docs/paradas/ADT-01_' + now, { id: 'ADT-01_' + now, tag: 'ADT-01', inicio: now, fim: null, motivo: 'Mecânica', etapas: [{ status: 'aguardando', t: now, por: 'Operação · A. Ribeiro' }], correcoes: [] }, cOp)).status, 200);
    const feed = (await req('GET', '/api/docs/log/feed')).j.data.eventos;
    const r = await req('PUT', '/api/docs/log/feed', { eventos: [{ t: now, tag: 'ADT-01', status: 'aguardando', acao: 'Parada aberta', por: 'Operação · A. Ribeiro' }] }, cOp);
    assert.equal(r.j.data.eventos[0].tag, 'ADT-01');
    assert.equal(r.j.data.eventos.length, Math.min(40, feed.length + 1));
    const ev = await db.pool.query("select count(*)::int n from eventos where tag = 'ADT-01' and acao = 'Parada aberta'");
    assert.equal(ev.rows[0].n, 1);
  });

  await t.test('regras de administrador', async () => {
    assert.equal((await req('PUT', '/api/docs/config/areas', { lista: ['A'] }, cOp)).status, 403);
    assert.equal((await req('PUT', '/api/docs/config/areas', { lista: ['A'] }, cAdm)).status, 200);
    assert.equal((await req('PUT', '/api/docs/usuarios/u777', { nome: 'X', curto: 'X', matricula: '777', perfil: 'admin', ativo: true, pin: '1111' }, cOp)).status, 403);
    assert.equal((await req('PUT', '/api/docs/usuarios/u777', { nome: 'X', curto: 'X', matricula: '777', perfil: 'manutencao', ativo: true, pin: '1111' }, cOp)).status, 200);
    assert.equal((await req('POST', '/api/login', { id: 'u777', pin: '1111' })).status, 200);
  });

  await t.test('bloquear usuário derruba a sessão dele', async () => {
    const c = (await req('POST', '/api/login', { id: 'u777', pin: '1111' })).cookie;
    await req('PUT', '/api/docs/usuarios/u777', { nome: 'X', curto: 'X', matricula: '777', perfil: 'manutencao', ativo: false }, cAdm);
    assert.equal((await req('GET', '/api/sessao', null, c)).j.usuario, null);
    assert.equal((await req('POST', '/api/login', { id: 'u777', pin: '1111' })).status, 401);
  });

  await t.test('relatórios CSV com chave', async () => {
    assert.equal((await req('GET', '/api/relatorios/paradas.csv?chave=errada')).status, 403);
    const r = await req('GET', '/api/relatorios/paradas.csv?chave=chave-teste');
    assert.equal(r.status, 200);
    assert.match(r.txt, /^\uFEFF?ID,TAG,Frota/);
    assert.match(r.txt, /ADT-01_/);
    for (const n of ['etapas', 'correcoes', 'equipamentos', 'eventos', 'usuarios']) {
      assert.equal((await req('GET', `/api/relatorios/${n}.csv?chave=chave-teste`)).status, 200, n);
    }
    assert.equal((await req('GET', '/api/relatorios', null, cOp)).status, 403);
    assert.equal((await req('GET', '/api/relatorios', null, cAdm)).j.tabelas.length, 6);
  });

  await t.test('tempo real envia as mudanças', async () => {
    const ctrl = new AbortController();
    const r = await fetch(base + '/api/stream', { signal: ctrl.signal });
    const leitor = r.body.getReader();
    let texto = '';
    const eq = (await req('GET', '/api/docs/equipamentos/GR-01')).j.data;
    await req('PUT', '/api/docs/equipamentos/GR-01', { ...eq, obs: 'teste-sse' }, cOp);
    const fim = Date.now() + 3000;
    while (!texto.includes('teste-sse') && Date.now() < fim) {
      const { value } = await leitor.read();
      texto += Buffer.from(value).toString();
    }
    ctrl.abort();
    assert.match(texto, /event: ola/);
    assert.match(texto, /teste-sse/);
  });
});
