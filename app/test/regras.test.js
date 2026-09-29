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
