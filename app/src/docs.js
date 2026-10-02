'use strict';
const { EventEmitter } = require('events');
const { pool } = require('./db');
const { definirPin } = require('./auth');
const regras = require('./regras');
const config = require('./config');

const mudancas = new EventEmitter();
mudancas.setMaxListeners(0);

const FEED_MAX = 40;
const ORDENAVEIS = new Set(['inicio', 't', 'atualizadoEm', 'capturadaEm']);

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

/* ---------- Horímetro ----------
   Cada leitura (coleção "leituras") guarda o valor e a hora em que foi CAPTURADA no equipamento,
   que pode ser bem antes da hora em que foi lançada no sistema. O horímetro atual do equipamento é
   sempre a leitura com a captura mais recente (não a última digitada), e a média de horas por dia
   sai das leituras dos últimos 30 dias. */
const DIA = 86400000;
const arred1 = n => Math.round(n * 10) / 10;
function fmtH(n) { return Number(n).toLocaleString('pt-BR') + ' h'; }
function fmtData(ms) {
  try { return new Date(ms).toLocaleString('pt-BR', { timeZone: config.tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); }
  catch (e) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }
}
function nomeUsuario(u) { return u ? (u.curto || u.nome || '') : ''; }

async function leiturasDe(c, tag) {
  const r = await c.query(
    `select id, (dados->>'valor')::numeric as v, (dados->>'capturadaEm')::bigint as t, dados->>'origem' as o
       from docs where colecao = 'leituras' and dados->>'tag' = $1 order by 3, 1`, [tag]);
  return r.rows.map(x => ({ id: x.id, v: Number(x.v), t: Number(x.t), o: x.o })).filter(x => Number.isFinite(x.v) && Number.isFinite(x.t));
}
// A leitura nova precisa caber entre a anterior e a seguinte (pela hora da coleta).
function validarLeitura(lista, t, v) {
  let prev = null, next = null;
  for (const l of lista) { if (l.t <= t) prev = l; else { next = l; break; } }
  if (prev && v < prev.v) return `O horímetro ${fmtH(v)} é menor que a leitura de ${fmtData(prev.t)} (${fmtH(prev.v)}). Confira o valor ou corrija aquela leitura.`;
  if (next && v > next.v) return `O horímetro ${fmtH(v)} é maior que a leitura seguinte, de ${fmtData(next.t)} (${fmtH(next.v)}). Confira a data e a hora da coleta.`;
  return null;
}
function derivarHorimetro(lista) {
  if (!lista.length) return null;
  const ult = lista[lista.length - 1];
  // A leitura inicial (cadastro antigo, data aproximada) não entra na média.
  const reais = lista.filter(l => l !== ult && l.o !== 'inicial' && l.t < ult.t);
  let ref = reais.find(l => l.t >= ult.t - 30 * DIA) || null;
  if (!ref && reais.length) ref = reais[reais.length - 1];
  let media = null;
  if (ref && ult.t - ref.t >= 12 * 3600000) media = Math.max(0, Math.min(24, arred1((ult.v - ref.v) / ((ult.t - ref.t) / DIA))));
  return { horimetro: ult.v, horimetroEm: ult.t, horimetroMedia: media };
}
// Grava um documento dentro da transação (efeitos automáticos do servidor) e devolve a mudança para o tempo real.
async function escreverTx(c, col, id, dados, uid) {
  const r = await c.query(
    `insert into docs (colecao, id, dados, versao, atualizado_em, atualizado_por) values ($1, $2, $3, 1, now(), $4)
     on conflict (colecao, id) do update set dados = excluded.dados, versao = docs.versao + 1,
       atualizado_em = now(), atualizado_por = excluded.atualizado_por
     returning versao`, [col, id, dados, uid]);
  await c.query('insert into historico (colecao, doc_id, operacao, usuario_id, dados) values ($1, $2, $3, $4, $5)', [col, id, 'set', uid, dados]);
  return { col, id, data: dados, v: r.rows[0].versao };
}
function numOuNull(v) { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? null : n; }

/**
 * Grava (op 'set') ou remove (op 'delete') um documento, conferindo as regras.
 * Retorna { id, data, v } do documento resultante (data null quando removido).
 */
async function gravar({ usuario, col, id, op, dados }) {
  const c = await pool.connect();
  let resultado, eraNovo = false;
  const extras = []; // mudanças feitas pelo próprio servidor (leitura criada, horímetro, preventiva)
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

    const uid0 = usuario ? usuario.id : null;
    // Leitura lançada (planejamento): precisa caber entre a anterior e a seguinte.
    if (col === 'leituras' && op === 'set') {
      novo.id = id;
      novo.valor = arred1(Number(novo.valor));
      novo.capturadaEm = Math.round(Number(novo.capturadaEm));
      if (anterior && anterior.tag !== novo.tag) throw new ErroRegra(400, 'A leitura não pode mudar de equipamento.');
      const eq = await c.query("select 1 from docs where colecao = 'equipamentos' and id = $1", [novo.tag]);
      if (!eq.rowCount) throw new ErroRegra(400, 'Equipamento não encontrado.');
      const msg = validarLeitura((await leiturasDe(c, novo.tag)).filter(l => l.id !== id), novo.capturadaEm, novo.valor);
      if (msg) throw new ErroRegra(400, msg);
      novo.lancadaEm = anterior && anterior.lancadaEm ? anterior.lancadaEm : Date.now();
      novo.lancadaPor = anterior && anterior.lancadaPor ? anterior.lancadaPor : (novo.lancadaPor || nomeUsuario(usuario));
      if (anterior) { novo.editadaEm = Date.now(); novo.editadaPor = nomeUsuario(usuario); }
      novo.origem = novo.origem || 'diaria';
    }
    // Equipamento: a leitura informada no quadro (abrir/liberar parada, cadastro, correção) vira uma
    // leitura, e o horímetro do equipamento é sempre o que as leituras dizem.
    if (col === 'equipamentos' && op === 'set') {
      const lista = await leiturasDe(c, id);
      const hl = novo.horLeitura, ah = anterior && anterior.horLeitura;
      if (hl && typeof hl === 'object' && numOuNull(hl.valor) != null && Number(hl.valor) >= 0 && numOuNull(hl.em) != null &&
          !(ah && Number(ah.em) === Number(hl.em) && Number(ah.valor) === Number(hl.valor))) {
        const t = Math.round(Number(hl.em)), v = arred1(Number(hl.valor)), lid = `${id}_${t}`;
        if (!lista.some(l => l.id === lid)) {
          const msg = t > Date.now() + 10 * 60000 ? 'A data da leitura não pode estar no futuro.' : validarLeitura(lista, t, v);
          if (msg) {
            // Correção e cadastro mostram o erro; nas paradas a leitura é só ignorada (a parada não pode se perder).
            if (hl.origem === 'correcao' || hl.origem === 'cadastro') throw new ErroRegra(400, msg);
          } else {
            const lei = { id: lid, tag: id, valor: v, capturadaEm: t, lancadaEm: Date.now(), lancadaPor: nomeUsuario(usuario), origem: hl.origem || 'parada' };
            extras.push(await escreverTx(c, 'leituras', lid, lei, uid0));
            lista.push({ id: lid, v, t }); lista.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
          }
        }
      }
      const d = derivarHorimetro(lista);
      if (d) Object.assign(novo, d);
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
    // Leitura lançada ou removida: atualiza o horímetro do equipamento.
    if (col === 'leituras') {
      const tag = (novo || anterior || {}).tag;
      if (tag) {
        await c.query('select pg_advisory_xact_lock(hashtext($1))', ['equipamentos/' + tag]);
        const er = await c.query("select dados from docs where colecao = 'equipamentos' and id = $1", [tag]);
        const d = er.rowCount ? derivarHorimetro(await leiturasDe(c, tag)) : null;
        if (d) {
          const eq = er.rows[0].dados;
          if (eq.horimetro !== d.horimetro || eq.horimetroEm !== d.horimetroEm || eq.horimetroMedia !== d.horimetroMedia) {
            extras.push(await escreverTx(c, 'equipamentos', tag, { ...eq, ...d }, uid0));
          }
        }
      }
    }
    // Parada preventiva liberada pela manutenção: a preventiva agendada sai da lista e vai para o
    // histórico (e volta se a liberação for desfeita ou a parada cancelada).
    if (col === 'paradas' && ((novo && novo.tipo === 'preventiva') || (anterior && anterior.tipo === 'preventiva'))) {
      const par = novo || anterior, tag = par.tag;
      const lib = novo && novo.tipo === 'preventiva' && !novo.cancelada ? (novo.etapas || []).find(e => e && e.status === 'liberado') : null;
      await c.query('select pg_advisory_xact_lock(hashtext($1))', ['preventivas/' + tag]);
      const pr = await c.query("select dados from docs where colecao = 'preventivas' and id = $1", [tag]);
      const pv = pr.rowCount ? { ...pr.rows[0].dados } : { tag, agendadas: [], historico: [] };
      const hist = Array.isArray(pv.historico) ? pv.historico.slice() : [];
      let ag = Array.isArray(pv.agendadas) ? pv.agendadas.slice() : [];
      const i = hist.findIndex(h => h && h.paradaId === id);
      let mudou = false;
      if (lib && i < 0) {
        const er = await c.query("select dados from docs where colecao = 'equipamentos' and id = $1", [tag]);
        const eqd = er.rowCount ? er.rows[0].dados : {};
        const hor = numOuNull(novo.horIni) ?? numOuNull(novo.horFim) ?? numOuNull(eqd.horimetro);
        const pm = novo.pm && typeof novo.pm === 'object' ? novo.pm : {};
        const a = ag.find(x => x && pm.id && x.id === pm.id);
        if (a) ag = ag.filter(x => x !== a);
        hist.push({ id: pm.id || ('h' + Date.now().toString(36)), nome: (a && a.nome) || pm.nome || 'Preventiva', alvo: a ? numOuNull(a.horimetro) : numOuNull(pm.alvo),
          horimetro: hor, em: Number(lib.t) || Date.now(), paradaId: id, numero: novo.numero || null, por: lib.por || '', origem: 'parada', agendada: a || null });
        mudou = true;
      } else if (!lib && i >= 0) {
        const h = hist.splice(i, 1)[0];
        if (h && h.agendada && !ag.some(x => x.id === h.agendada.id)) ag.push(h.agendada);
        mudou = true;
      }
      if (mudou) {
        hist.sort((x, y) => (x.em || 0) - (y.em || 0));
        ag.sort((x, y) => Number(x.horimetro) - Number(y.horimetro));
        extras.push(await escreverTx(c, 'preventivas', tag, { ...pv, tag, agendadas: ag, historico: hist.slice(-200), atualizadoEm: Date.now() }, uid0));
      }
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
  for (const m of extras) mudancas.emit('mudanca', m);
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

  // Situações ligadas às peças:
  //   aguardando_peca     "Peças solicitadas"  - há peça pendente sem ordem de compra
  //   aguardando_entrega  "Aguardando peças"   - todas as pendentes já têm ordem de compra
  //   pecas_recebidas     "Peças recebidas"    - tudo chegou; um mecânico precisa assumir o atendimento
  const STATUS_PECAS = ['em_manutencao', 'aguardando_peca', 'aguardando_entrega', 'pecas_recebidas'];
  let novoStatus = null, acao = '', detalhe = '';
  if (daParada && STATUS_PECAS.includes(eq.status)) {
    const chegaram = ativos.filter(i => i.chegou).length;
    let alvo = eq.status;
    if (pendentes.length) alvo = pendentes.some(i => !String(i.oc || '').trim()) ? 'aguardando_peca' : 'aguardando_entrega';
    else if (eq.status === 'aguardando_peca' || eq.status === 'aguardando_entrega') alvo = chegaram ? 'pecas_recebidas' : 'em_manutencao';
    if (alvo !== eq.status) {
      novoStatus = alvo;
      if (alvo === 'aguardando_peca') {
        acao = 'Peças solicitadas';
        const sem = pendentes.filter(i => !String(i.oc || '').trim());
        detalhe = `${n} · ${sem.length} ${sem.length > 1 ? 'itens' : 'item'} sem ordem de compra: ${nomeLista(sem)}`;
      } else if (alvo === 'aguardando_entrega') {
        acao = 'Ordens de compra lançadas';
        const ocs = [...new Set(pendentes.map(i => String(i.oc).trim()))];
        detalhe = `${n} · aguardando ${pendentes.length} ${pendentes.length > 1 ? 'itens' : 'item'} · OC ${ocs.join(', ')}`;
      } else if (alvo === 'pecas_recebidas') {
        acao = 'Peças recebidas';
        detalhe = `${n} · ${chegaram} ${chegaram > 1 ? 'itens chegaram' : 'item chegou'} · aguardando mecânico assumir`;
      } else {
        acao = 'Solicitação de peças cancelada';
        detalhe = `${n} · atendimento continua`;
      }
    }
  }

  const eventos = [];
  if (novoStatus) {
    const antes = { ...eq }; delete antes.anterior; delete antes.ultAcao;
    const novoEq = { ...antes, status: novoStatus, desde: now, anterior: antes,
      ultAcao: { a: 'pecas', t: now, papel: 'sistema', uid: '', nome: usuario ? usuario.curto || '' : '' } };
    // Peças recebidas: o atendimento fica sem responsável até um mecânico assumir de novo.
    if (novoStatus === 'pecas_recebidas') novoEq.tecnico = '';
    const novaPar = { ...par, etapas: [...(par.etapas || []), { status: novoStatus, t: now, por: quem }] };
    await gravar({ usuario, col: 'equipamentos', id: eq.tag, op: 'set', dados: novoEq });
    await gravar({ usuario, col: 'paradas', id: paradaId, op: 'set', dados: novaPar });
    eventos.push({ t: now, tag: eq.tag, status: novoStatus, acao, por: quem, detalhe });
  } else if (novas.length && (eq.status === 'aguardando_peca' || eq.status === 'aguardando_entrega') && daParada) {
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

// Equipamentos que já tinham horímetro antes das leituras ganham uma leitura inicial.
async function leiturasIniciais() {
  const r = await pool.query(`
    select e.id, e.dados, (extract(epoch from e.atualizado_em) * 1000)::bigint as em from docs e
     where e.colecao = 'equipamentos' and dt_num(e.dados->>'horimetro') is not null
       and not exists (select 1 from docs l where l.colecao = 'leituras' and l.dados->>'tag' = e.id)`).catch(() => ({ rows: [] }));
  for (const row of r.rows) {
    const v = Number(row.dados.horimetro);
    if (!Number.isFinite(v) || v < 0) continue;
    // Sem a data da última leitura, considera um dia antes (a data exata não é conhecida).
    const t = Number(row.dados.horimetroEm) || Math.min(Number(row.em) || Date.now(), Date.now()) - DIA;
    const lid = `${row.id}_${Math.round(t)}`;
    const c = await pool.connect();
    try {
      await c.query('begin');
      await escreverTx(c, 'leituras', lid, { id: lid, tag: row.id, valor: arred1(v), capturadaEm: Math.round(t), lancadaEm: Date.now(), lancadaPor: 'Sistema', origem: 'inicial' }, null);
      const d = derivarHorimetro(await leiturasDe(c, row.id));
      if (d) await escreverTx(c, 'equipamentos', row.id, { ...row.dados, ...d }, null);
      await c.query('commit');
    } catch (e) { await c.query('rollback').catch(() => {}); console.error('[leituras]', e.message); } finally { c.release(); }
  }
}

module.exports = { listar, ler, gravar, mesclarFeed, publico, mudancas, ErroRegra, contarUsuarios, numerarParadas, leiturasIniciais, validarLeitura, derivarHorimetro, conferirPecas, aguardarConferencias: () => filaConferencia };
