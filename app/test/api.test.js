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
    assert.match(r.txt, /^\uFEFF?ID,Nº,TAG,Oficina,Frota/);
    assert.match(r.txt, /ADT-01_/);
    for (const n of ['etapas', 'correcoes', 'equipamentos', 'eventos', 'usuarios']) {
      assert.equal((await req('GET', `/api/relatorios/${n}.csv?chave=chave-teste`)).status, 200, n);
    }
    assert.equal((await req('GET', '/api/relatorios', null, cOp)).status, 403);
    assert.equal((await req('GET', '/api/relatorios', null, cAdm)).j.tabelas.length, 10);
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
    await espera();
    // todas com OC -> "Aguardando peças"
    assert.equal((await req('GET', '/api/docs/equipamentos/WL-01')).j.data.status, 'aguardando_entrega');
    feed = (await req('GET', '/api/docs/log/feed')).j.data.eventos;
    assert.equal(feed[0].acao, 'Ordens de compra lançadas');
    const a2 = (await req('GET', `/api/docs/pecas/${pid}_a`)).j.data;
    await req('PUT', `/api/docs/pecas/${pid}_a`, { ...a2, chegou: true, chegouEm: Date.now() }, cP);
    await espera();
    assert.equal((await req('GET', '/api/docs/equipamentos/WL-01')).j.data.status, 'aguardando_entrega');
    // manutenção adiciona mais uma peça (sem OC) -> volta para "Peças solicitadas"
    await req('PUT', `/api/docs/pecas/${pid}_c`, { paradaId: pid, descricao: 'Anel de vedação', qtd: 4, oc: '', chegou: false, criadoEm: Date.now() }, cMan);
    await espera();
    assert.equal((await req('GET', '/api/docs/equipamentos/WL-01')).j.data.status, 'aguardando_peca');
    feed = (await req('GET', '/api/docs/log/feed')).j.data.eventos;
    assert.equal(feed[0].acao, 'Peças solicitadas');
    const c0 = (await req('GET', `/api/docs/pecas/${pid}_c`)).j.data;
    await req('PUT', `/api/docs/pecas/${pid}_c`, { ...c0, oc: '4500999' }, cP);
    await espera();
    assert.equal((await req('GET', '/api/docs/equipamentos/WL-01')).j.data.status, 'aguardando_entrega');
    // nova peça numa solicitação que já está com OC lançada: evento para o planejamento
    await req('PUT', `/api/docs/pecas/${pid}_d`, { paradaId: pid, descricao: 'Graxa', qtd: 1, oc: '4500999', chegou: false, criadoEm: Date.now() }, cP);
    await espera();
    feed = (await req('GET', '/api/docs/log/feed')).j.data.eventos;
    assert.equal(feed[0].acao, 'Peças adicionadas');
    for (const k of ['b', 'c', 'd']) {
      const it = (await req('GET', `/api/docs/pecas/${pid}_${k}`)).j.data;
      await req('PUT', `/api/docs/pecas/${pid}_${k}`, { ...it, chegou: true, chegouEm: Date.now() }, cP);
    }
    await espera();
    // tudo chegou -> "Peças recebidas", sem técnico: um mecânico precisa assumir
    const fim = (await req('GET', '/api/docs/equipamentos/WL-01')).j.data;
    assert.equal(fim.status, 'pecas_recebidas');
    assert.equal(fim.tecnico, '');
    feed = (await req('GET', '/api/docs/log/feed')).j.data.eventos;
    assert.equal(feed[0].acao, 'Peças recebidas');
    const etapas = (await req('GET', '/api/docs/paradas/' + pid)).j.data.etapas.map(e => e.status);
    assert.deepEqual(etapas.slice(-2), ['aguardando_entrega', 'pecas_recebidas']);
    const csv = await req('GET', '/api/relatorios/pecas.csv?chave=chave-teste');
    assert.equal(csv.status, 200);
    assert.match(csv.txt, /Filtro hidráulico/);
    assert.match(csv.txt, /4500123/);
  });

  await t.test('horímetro: leituras com hora da coleta, validação e horímetro derivado', async () => {
    const cP = (await req('POST', '/api/login', { id: 'u50001', pin: '5555' })).cookie;
    const H = 3600000, agora = Date.now();
    // leitura inicial criada na partida (protótipo), com a data da última leitura conhecida
    await db.pool.query("update docs set dados = jsonb_set(dados, '{horimetroEm}', to_jsonb($1::bigint)) where colecao = 'equipamentos' and id = 'DZ-01'", [agora - 48 * H]);
    await docs.leiturasIniciais();
    const ini = (await req('GET', '/api/docs/leituras')).j.docs.filter(d => d.data.tag === 'DZ-01');
    assert.equal(ini.length, 1);
    assert.equal(ini[0].data.origem, 'inicial');
    const base = ini[0].data.valor, t0 = ini[0].data.capturadaEm;
    // operação não lança leitura diária
    assert.equal((await req('PUT', '/api/docs/leituras/DZ-01_x', { tag: 'DZ-01', valor: base + 5, capturadaEm: agora }, cOp)).status, 403);
    // planejamento lança leitura coletada de manhã, mas digitada agora
    const tManha = Math.max(t0 + 2 * H, agora - 10 * H);
    let r = await req('PUT', `/api/docs/leituras/DZ-01_${tManha}`, { tag: 'DZ-01', valor: base + 20, capturadaEm: tManha }, cP);
    assert.equal(r.status, 200, r.txt);
    assert.equal(r.j.data.lancadaPor, 'P. Planner');
    let eq = (await req('GET', '/api/docs/equipamentos/DZ-01')).j.data;
    assert.equal(eq.horimetro, base + 20);
    assert.equal(eq.horimetroEm, tManha);
    // leitura menor que a anterior é recusada
    r = await req('PUT', `/api/docs/leituras/DZ-01_${agora}`, { tag: 'DZ-01', valor: base + 10, capturadaEm: agora }, cP);
    assert.equal(r.status, 400);
    assert.match(r.j.erro, /menor que a leitura/);
    // leitura atrasada (coleta antiga) não substitui a mais recente
    const tMeio = tManha - H;
    r = await req('PUT', `/api/docs/leituras/DZ-01_${tMeio}`, { tag: 'DZ-01', valor: base + 15, capturadaEm: tMeio }, cP);
    assert.equal(r.status, 200, r.txt);
    eq = (await req('GET', '/api/docs/equipamentos/DZ-01')).j.data;
    assert.equal(eq.horimetro, base + 20);
    // e não pode passar da leitura seguinte
    assert.equal((await req('PUT', `/api/docs/leituras/DZ-01_${tMeio + 1}`, { tag: 'DZ-01', valor: base + 30, capturadaEm: tMeio + 1 }, cP)).status, 400);
    // data no futuro é recusada
    assert.equal((await req('PUT', `/api/docs/leituras/DZ-01_f`, { tag: 'DZ-01', valor: base + 99, capturadaEm: agora + 3 * H }, cP)).status, 400);
    // leitura vinda do quadro (abertura de parada) vira leitura e o horímetro do cliente não manda
    const t2 = Date.now();
    r = await req('PUT', '/api/docs/equipamentos/DZ-01', { ...eq, horimetro: 1, horLeitura: { valor: base + 25, em: t2, origem: 'parada' } }, cOp);
    assert.equal(r.status, 200);
    assert.equal(r.j.data.horimetro, base + 25);
    const l2 = (await req('GET', `/api/docs/leituras/DZ-01_${t2}`)).j.data;
    assert.equal(l2.origem, 'parada');
    // gravação antiga do equipamento (cópia desatualizada) não volta o horímetro
    r = await req('PUT', '/api/docs/equipamentos/DZ-01', { ...eq, obs: 'x' }, cOp);
    assert.equal(r.j.data.horimetro, base + 25);
    // correção com valor menor é recusada com explicação
    r = await req('PUT', '/api/docs/equipamentos/DZ-01', { ...r.j.data, horLeitura: { valor: base, em: Date.now(), origem: 'correcao' } }, cOp);
    assert.equal(r.status, 400);
    // remover a leitura volta o horímetro para a anterior
    assert.equal((await req('DELETE', `/api/docs/leituras/DZ-01_${t2}`, null, cP)).status, 200);
    eq = (await req('GET', '/api/docs/equipamentos/DZ-01')).j.data;
    assert.equal(eq.horimetro, base + 20);
    assert.ok(eq.horimetroMedia == null || eq.horimetroMedia >= 0);
    const csv = await req('GET', '/api/relatorios/leituras.csv?chave=chave-teste');
    assert.equal(csv.status, 200);
    assert.match(csv.txt, /DZ-01/);
  });

  await t.test('preventiva agendada por equipamento: liberação da parada preventiva marca como feita', async () => {
    const cP = (await req('POST', '/api/login', { id: 'u50001', pin: '5555' })).cookie;
    const cMan = (await req('POST', '/api/login', { id: 'u30101', pin: '1234' })).cookie;
    assert.equal((await req('PUT', '/api/docs/config/preventiva', { aviso: 40 }, cOp)).status, 403);
    assert.equal((await req('PUT', '/api/docs/config/preventiva', { aviso: 40 }, cP)).status, 200);
    const doc = { tag: 'DZ-02', agendadas: [{ id: 'a1', nome: 'PM 500', horimetro: 5000 }, { id: 'a2', nome: 'Troca de óleo', horimetro: 5250 }], historico: [] };
    assert.equal((await req('PUT', '/api/docs/preventivas/DZ-02', doc, cMan)).status, 403);
    assert.equal((await req('PUT', '/api/docs/preventivas/DZ-02', doc, cP)).status, 200);
    const now = Date.now(), pid = 'DZ-02_' + now;
    const par = { id: pid, tag: 'DZ-02', tipo: 'preventiva', pm: { id: 'a1', nome: 'PM 500', alvo: 5000 }, inicio: now, fim: null, motivo: 'Preventiva', horIni: 4990, etapas: [{ status: 'aguardando', t: now, por: 'Operação' }], correcoes: [] };
    await req('PUT', '/api/docs/paradas/' + pid, par, cOp);
    let pv = (await req('GET', '/api/docs/preventivas/DZ-02')).j.data;
    assert.equal(pv.agendadas.length, 2);
    par.etapas.push({ status: 'em_manutencao', t: now + 1 }, { status: 'liberado', t: now + 2, por: 'Manutenção · J. Souza' });
    await req('PUT', '/api/docs/paradas/' + pid, par, cMan);
    pv = (await req('GET', '/api/docs/preventivas/DZ-02')).j.data;
    assert.deepEqual(pv.agendadas.map(a => a.id), ['a2']);
    assert.deepEqual([pv.historico[0].nome, pv.historico[0].alvo, pv.historico[0].horimetro, pv.historico[0].paradaId], ['PM 500', 5000, 4990, pid]);
    // liberação desfeita: volta para as agendadas
    par.etapas.pop();
    await req('PUT', '/api/docs/paradas/' + pid, par, cMan);
    pv = (await req('GET', '/api/docs/preventivas/DZ-02')).j.data;
    assert.deepEqual(pv.agendadas.map(a => a.id), ['a1', 'a2']);
    assert.equal(pv.historico.length, 0);
    par.etapas.push({ status: 'liberado', t: now + 3, por: 'Manutenção · J. Souza' });
    await req('PUT', '/api/docs/paradas/' + pid, par, cMan);
    const csv = await req('GET', '/api/relatorios/preventivas.csv?chave=chave-teste');
    assert.match(csv.txt, /DZ-02,.*PM 500/);
    const ag = await req('GET', '/api/relatorios/agendadas.csv?chave=chave-teste');
    assert.match(ag.txt, /DZ-02,.*Troca de óleo/);
    const pcsv = await req('GET', '/api/relatorios/paradas.csv?chave=chave-teste');
    assert.match(pcsv.txt, /Preventiva/);
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
