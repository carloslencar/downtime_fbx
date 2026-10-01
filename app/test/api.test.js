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
  const docs = require('../src/docs');
  await db.pool.query('drop schema public cascade; create schema public');
  await db.migrar();
  await seed.importarInicial();
  await docs.numerarParadas();
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
    assert.match(r.txt, /^\uFEFF?ID,Nº,TAG,Frota/);
    assert.match(r.txt, /ADT-01_/);
    for (const n of ['etapas', 'correcoes', 'equipamentos', 'eventos', 'usuarios']) {
      assert.equal((await req('GET', `/api/relatorios/${n}.csv?chave=chave-teste`)).status, 200, n);
    }
    assert.equal((await req('GET', '/api/relatorios', null, cOp)).status, 403);
    assert.equal((await req('GET', '/api/relatorios', null, cAdm)).j.tabelas.length, 7);
  });

  await t.test('paradas recebem número sequencial', async () => {
    const r = await req('GET', '/api/docs/paradas?ordem=inicio&dir=asc');
    const nums = r.j.docs.map(d => d.data.numero);
    assert.ok(nums.every(n => Number.isInteger(n)));
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
    assert.equal(new Set(nums).size, nums.length);
  });

  await t.test('solicitação de peças: manutenção pede, planejamento informa OC e chegada', async () => {
    const espera = async () => { await new Promise(r => setTimeout(r, 600)); await docs.aguardarConferencias(); };
    const cMan = (await req('POST', '/api/login', { id: 'u30101', pin: '1234' })).cookie;
    const cPlan = (await req('PUT', '/api/docs/usuarios/u50001', { nome: 'Paula Planner', curto: 'P. Planner', matricula: '50001', perfil: 'planejador', ativo: true, pin: '5555' }, cAdm)).status;
    assert.equal(cPlan, 200);
    const cP = (await req('POST', '/api/login', { id: 'u50001', pin: '5555' })).cookie;
    const now = Date.now(), pid = 'WL-01_' + now;
    const eq = (await req('GET', '/api/docs/equipamentos/WL-01')).j.data;
    await req('PUT', '/api/docs/paradas/' + pid, { id: pid, tag: 'WL-01', inicio: now, fim: null, motivo: 'Hidráulica', etapas: [{ status: 'aguardando', t: now }, { status: 'em_manutencao', t: now }], correcoes: [] }, cMan);
    await req('PUT', '/api/docs/equipamentos/WL-01', { ...eq, status: 'em_manutencao', paradaId: pid, desde: now }, cMan);
    const par = (await req('GET', '/api/docs/paradas/' + pid)).j.data;
    assert.ok(par.numero > 0);
    // operação não mexe em peças
    assert.equal((await req('PUT', `/api/docs/pecas/${pid}_a`, { paradaId: pid, descricao: 'Filtro', qtd: 1 }, cOp)).status, 403);
    for (const [k, d] of [['a', 'Mangueira 1/2"'], ['b', 'Filtro hidráulico']]) {
      const r = await req('PUT', `/api/docs/pecas/${pid}_${k}`, { paradaId: pid, descricao: d, qtd: 2, oc: '', chegou: false, criadoEm: now }, cMan);
      assert.equal(r.status, 200);
      assert.equal(r.j.data.numero, par.numero);
      assert.equal(r.j.data.tag, 'WL-01');
    }
    await espera();
    assert.equal((await req('GET', '/api/docs/equipamentos/WL-01')).j.data.status, 'aguardando_peca');
    let feed = (await req('GET', '/api/docs/log/feed')).j.data.eventos;
    assert.equal(feed[0].acao, 'Peças solicitadas');
    assert.match(feed[0].detalhe, /2 itens/);
    // manutenção não informa OC nem chegada
    const a = (await req('GET', `/api/docs/pecas/${pid}_a`)).j.data;
    assert.equal((await req('PUT', `/api/docs/pecas/${pid}_a`, { ...a, oc: 'OC-1' }, cMan)).status, 403);
    // planejamento: mesma OC para as duas, chegada de uma
    for (const k of ['a', 'b']) {
      const it = (await req('GET', `/api/docs/pecas/${pid}_${k}`)).j.data;
      assert.equal((await req('PUT', `/api/docs/pecas/${pid}_${k}`, { ...it, oc: '4500123' }, cP)).status, 200);
    }
    const a2 = (await req('GET', `/api/docs/pecas/${pid}_a`)).j.data;
    await req('PUT', `/api/docs/pecas/${pid}_a`, { ...a2, chegou: true, chegouEm: Date.now() }, cP);
    await espera();
    assert.equal((await req('GET', '/api/docs/equipamentos/WL-01')).j.data.status, 'aguardando_peca');
    // manutenção adiciona mais uma peça -> evento para o planejamento
    await req('PUT', `/api/docs/pecas/${pid}_c`, { paradaId: pid, descricao: 'Anel de vedação', qtd: 4, oc: '', chegou: false, criadoEm: Date.now() }, cMan);
    await espera();
    feed = (await req('GET', '/api/docs/log/feed')).j.data.eventos;
    assert.equal(feed[0].acao, 'Peças adicionadas');
    for (const k of ['b', 'c']) {
      const it = (await req('GET', `/api/docs/pecas/${pid}_${k}`)).j.data;
      await req('PUT', `/api/docs/pecas/${pid}_${k}`, { ...it, chegou: true, chegouEm: Date.now() }, cP);
    }
    await espera();
    const fim = (await req('GET', '/api/docs/equipamentos/WL-01')).j.data;
    assert.equal(fim.status, 'em_manutencao');
    feed = (await req('GET', '/api/docs/log/feed')).j.data.eventos;
    assert.equal(feed[0].acao, 'Peças recebidas');
    const etapas = (await req('GET', '/api/docs/paradas/' + pid)).j.data.etapas.map(e => e.status);
    assert.deepEqual(etapas.slice(-2), ['aguardando_peca', 'em_manutencao']);
    const csv = await req('GET', '/api/relatorios/pecas.csv?chave=chave-teste');
    assert.equal(csv.status, 200);
    assert.match(csv.txt, /Filtro hidráulico/);
    assert.match(csv.txt, /4500123/);
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
