'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { verificar } = require('../src/regras');
const { mesclarFeed, publico } = require('../src/docs');

const op = { id: 'u1', perfil: 'operacao' };
const adm = { id: 'u9', perfil: 'admin' };

test('sem login não grava, exceto o primeiro administrador', () => {
  assert.equal(verificar({ usuario: null, col: 'equipamentos', id: 'ADT-01', op: 'set', novo: {} }).status, 401);
  assert.equal(verificar({ usuario: null, col: 'usuarios', id: 'u1', op: 'set', novo: { perfil: 'admin' }, haUsuarios: false }), null);
  assert.equal(verificar({ usuario: null, col: 'usuarios', id: 'u1', op: 'set', novo: { perfil: 'operacao' }, haUsuarios: false }).status, 401);
  assert.equal(verificar({ usuario: null, col: 'usuarios', id: 'u1', op: 'set', novo: { perfil: 'admin' }, haUsuarios: true }).status, 401);
});

test('operação e manutenção gravam o quadro e o cadastro', () => {
  for (const col of ['equipamentos', 'paradas']) assert.equal(verificar({ usuario: op, col, id: 'X-1', op: 'set', novo: {} }), null);
  assert.equal(verificar({ usuario: op, col: 'log', id: 'feed', op: 'set', novo: { eventos: [] } }), null);
  assert.equal(verificar({ usuario: op, col: 'config', id: 'frotas', op: 'set', novo: { lista: [] } }), null);
  assert.equal(verificar({ usuario: op, col: 'usuarios', id: 'u2', op: 'set', novo: { perfil: 'manutencao' } }), null);
});

test('configurações de todas as telas e áreas só com administrador', () => {
  for (const id of ['opcoes', 'areas']) {
    assert.equal(verificar({ usuario: op, col: 'config', id, op: 'set', novo: {} }).status, 403);
    assert.equal(verificar({ usuario: adm, col: 'config', id, op: 'set', novo: {} }), null);
  }
});

test('administradores só são criados ou alterados por administrador', () => {
  assert.equal(verificar({ usuario: op, col: 'usuarios', id: 'u3', op: 'set', novo: { perfil: 'admin' } }).status, 403);
  assert.equal(verificar({ usuario: op, col: 'usuarios', id: 'u9', op: 'set', anterior: { perfil: 'admin' }, novo: { perfil: 'operacao' } }).status, 403);
  assert.equal(verificar({ usuario: adm, col: 'usuarios', id: 'u3', op: 'set', novo: { perfil: 'admin' }, adminsAtivos: 1 }), null);
});

test('não remove o próprio usuário nem o último administrador', () => {
  assert.equal(verificar({ usuario: op, col: 'usuarios', id: 'u1', op: 'delete', anterior: { perfil: 'operacao' } }).status, 403);
  assert.equal(verificar({ usuario: adm, col: 'usuarios', id: 'u8', op: 'set', anterior: { perfil: 'admin' }, novo: { perfil: 'operacao' }, adminsAtivos: 1 }).status, 403);
  assert.equal(verificar({ usuario: adm, col: 'usuarios', id: 'u8', op: 'set', anterior: { perfil: 'admin' }, novo: { perfil: 'operacao' }, adminsAtivos: 2 }), null);
});

test('coleções e ids inválidos são recusados', () => {
  assert.equal(verificar({ usuario: adm, col: 'segredos', id: 'x', op: 'set', novo: {} }).status, 404);
  assert.equal(verificar({ usuario: adm, col: 'paradas', id: '../x', op: 'set', novo: {} }).status, 400);
});

test('feed mescla sem perder eventos e guarda os 40 mais recentes', () => {
  const a = [{ t: 3, tag: 'A', acao: 'x' }, { t: 1, tag: 'B', acao: 'y' }];
  const b = [{ t: 2, tag: 'C', acao: 'z' }, { t: 1, tag: 'B', acao: 'y' }];
  assert.deepEqual(mesclarFeed(a, b).map(e => e.t), [3, 2, 1]);
  const muitos = Array.from({ length: 60 }, (_, i) => ({ t: i, tag: 'T', acao: 'a' }));
  assert.equal(mesclarFeed([], muitos).length, 40);
});

test('usuário nunca sai com PIN ou hash', () => {
  assert.deepEqual(publico('usuarios', { nome: 'A', pinHash: 'x', pin: '1234' }), { nome: 'A' });
});

test('peças: manutenção pede, planejamento informa OC e chegada, operação não mexe', () => {
  const man = { id: 'm', perfil: 'manutencao' }, plan = { id: 'p', perfil: 'planejador' };
  const nova = { paradaId: 'X_1', descricao: 'Filtro', qtd: 1, oc: '', chegou: false };
  assert.equal(verificar({ usuario: man, col: 'pecas', id: 'X_1_a', op: 'set', novo: nova }), null);
  assert.equal(verificar({ usuario: plan, col: 'pecas', id: 'X_1_a', op: 'set', novo: nova }), null);
  assert.equal(verificar({ usuario: op, col: 'pecas', id: 'X_1_a', op: 'set', novo: nova }).status, 403);
  assert.equal(verificar({ usuario: man, col: 'pecas', id: 'X_1_a', op: 'set', anterior: nova, novo: { ...nova, oc: '45' } }).status, 403);
  assert.equal(verificar({ usuario: man, col: 'pecas', id: 'X_1_a', op: 'set', anterior: nova, novo: { ...nova, chegou: true } }).status, 403);
  assert.equal(verificar({ usuario: plan, col: 'pecas', id: 'X_1_a', op: 'set', anterior: nova, novo: { ...nova, oc: '45', chegou: true } }), null);
  assert.equal(verificar({ usuario: man, col: 'pecas', id: 'X_1_a', op: 'set', anterior: nova, novo: { ...nova, qtd: 3 } }), null);
  assert.equal(verificar({ usuario: plan, col: 'pecas', id: 'X_1_a', op: 'delete', anterior: nova }).status, 403);
  assert.equal(verificar({ usuario: man, col: 'pecas', id: 'X_1_a', op: 'set', novo: { ...nova, descricao: ' ' } }).status, 400);
});

test('horímetro e preventivas: só planejamento e administrador', () => {
  const plan = { id: 'u5', perfil: 'planejador' }, op = { id: 'u1', perfil: 'operacao' }, man = { id: 'u3', perfil: 'manutencao' };
  const lei = { tag: 'ADT-01', valor: 100, capturadaEm: Date.now() - 1000 };
  assert.equal(verificar({ usuario: plan, col: 'leituras', id: 'ADT-01_1', op: 'set', novo: lei }), null);
  assert.equal(verificar({ usuario: op, col: 'leituras', id: 'ADT-01_1', op: 'set', novo: lei }).status, 403);
  assert.equal(verificar({ usuario: man, col: 'leituras', id: 'ADT-01_1', op: 'delete' }).status, 403);
  assert.equal(verificar({ usuario: plan, col: 'leituras', id: 'ADT-01_1', op: 'set', novo: { ...lei, capturadaEm: Date.now() + 3600000 } }).status, 400);
  assert.equal(verificar({ usuario: plan, col: 'leituras', id: 'ADT-01_1', op: 'set', novo: { ...lei, valor: '' } }).status, 400);
  assert.equal(verificar({ usuario: plan, col: 'config', id: 'planos', op: 'set', novo: { lista: [{ nome: 'A', intervalos: [250, 500] }] } }), null);
  assert.equal(verificar({ usuario: plan, col: 'config', id: 'planos', op: 'set', novo: { lista: [{ nome: 'A', intervalos: [250, 600] }] } }).status, 400);
  assert.equal(verificar({ usuario: man, col: 'config', id: 'planos', op: 'set', novo: { lista: [] } }).status, 403);
  assert.equal(verificar({ usuario: plan, col: 'preventivas', id: 'ADT-01', op: 'set', novo: { tag: 'ADT-01', historico: [] } }), null);
  assert.equal(verificar({ usuario: op, col: 'preventivas', id: 'ADT-01', op: 'set', novo: { tag: 'ADT-01', historico: [] } }).status, 403);
  assert.equal(verificar({ usuario: plan, col: 'preventivas', id: 'ADT-01', op: 'delete' }).status, 403);
});

test('horímetro derivado: a coleta mais recente vale, mesmo lançada antes', () => {
  const { validarLeitura, derivarHorimetro } = require('../src/docs');
  const D = 86400000;
  const l = [{ id: 'a', v: 1000, t: 0 }, { id: 'b', v: 1020, t: D }, { id: 'c', v: 1040, t: 2 * D }];
  assert.deepEqual(derivarHorimetro(l), { horimetro: 1040, horimetroEm: 2 * D, horimetroMedia: 20 });
  assert.equal(validarLeitura(l, 1.5 * D, 1030), null);
  assert.match(validarLeitura(l, 1.5 * D, 1010), /menor/);
  assert.match(validarLeitura(l, 1.5 * D, 1050), /maior/);
  assert.equal(derivarHorimetro([]), null);
  assert.equal(derivarHorimetro([{ id: 'a', v: 5, t: 0 }]).horimetroMedia, null);
});
