/* ---------- Peças: solicitação pela manutenção, ordem de compra e chegada pelo planejamento ----------
   Cada item é um registro na coleção "pecas", ligado à parada (paradaId) e ao número da parada.
   O servidor muda o status do equipamento sozinho:
   - peça pendente numa parada em manutenção  -> "Peças solicitadas";
   - todas as peças chegaram (ou foram canceladas) -> volta para "Em manutenção". */
let pecas = {};
let pFiltro = 'pendentes', pBusca = '', pSel = new Set(), pConfCancel = null, pMsg = '';

window.dt.db.collection('pecas').onSnapshot(snap => {
  for (const c of snap.docChanges()) {
    if (c.type === 'removed') delete pecas[c.doc.id]; else pecas[c.doc.id] = { ...c.doc.data() };
  }
  if (typeof render === 'function') render();
  if (vista === 'pecas' && !$('#v-pecas').hidden) renderPecas();
  if (aberto && !aberto.modo) renderModal();
}, () => {});

function itensDaParada(pid) {
  return Object.values(pecas).filter(i => i.paradaId === pid).sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0) || (a.id < b.id ? -1 : 1));
}
function resumoPecas(pid) {
  const l = pid ? itensDaParada(pid).filter(i => !i.cancelada) : [];
  const chegaram = l.filter(i => i.chegou).length;
  return { total: l.length, chegaram, pendentes: l.length - chegaram, semOc: l.filter(i => !i.chegou && !i.oc).length };
}
function textoResumoPecas(pid) {
  const r = resumoPecas(pid);
  return `${r.total} ${r.total > 1 ? 'peças' : 'peça'} · ${r.chegaram} ${r.chegaram === 1 ? 'chegou' : 'chegaram'}`;
}
function numeroParada(pid, item) {
  const n = (paradas[pid] && paradas[pid].numero) || (item && item.numero);
  return n ? 'Parada nº ' + n : 'Parada';
}
function podePlanejar() { return papel === 'planejador' || papel === 'admin'; }
function podePedirPecas() { return papel === 'manutencao' || podePlanejar(); }
function quemSou() { return (PAPEL_NOME[papel] || '') + nomeSessao(); }
function situacaoItem(i) {
  if (i.cancelada) return { c: 'cancel', t: 'Cancelada' };
  if (i.chegou) return { c: 'ok', t: 'Chegou ' + dataHora(i.chegouEm) };
  if (i.oc) return { c: 'oc', t: 'OC ' + i.oc + ' · aguardando chegada' };
  return { c: 'sem', t: 'Aguardando ordem de compra' };
}

/* ---------- gravação ---------- */
async function gravarItem(item, patch) {
  const doc = { ...item, ...patch, atualizadoEm: Date.now(), atualizadoPor: quemSou() };
  await db.doc('pecas/' + item.id).set(doc);
  pecas[item.id] = doc;
}
async function criarItens(pid, linhas) {
  const now = Date.now(), base = now.toString(36);
  let k = 0;
  for (const l of linhas) {
    const id = `${pid}_p${base}${(k++).toString(36)}`;
    await gravarItem({ id }, {
      paradaId: pid, descricao: l.d, codigo: l.c || '', qtd: l.q, oc: '', chegou: false, cancelada: false,
      criadoEm: now, criadoPor: (usuarioAtual() || {}).curto || '', perfilCriador: papel
    });
  }
}
function lerLinhas(raiz) {
  return [...raiz.querySelectorAll('.pl')].map(r => ({
    d: r.querySelector('.pl-d').value.trim(), c: r.querySelector('.pl-c').value.trim(),
    q: Math.max(1, Math.round(Number(r.querySelector('.pl-q').value) || 1))
  }));
}
function linhasHtml(linhas) {
  return linhas.map((l, i) => `<div class="pl" data-i="${i}">
    <input type="text" class="pl-d" maxlength="80" placeholder="Descrição da peça" aria-label="Descrição da peça" value="${esc(l.d)}">
    <input type="text" class="pl-c" maxlength="40" placeholder="Código (opcional)" aria-label="Código da peça" value="${esc(l.c)}">
    <input type="number" class="pl-q" min="1" step="1" inputmode="numeric" aria-label="Quantidade" value="${esc(l.q)}">
    <button type="button" class="pl-x" data-acao="rmLinha" data-i="${i}" aria-label="Remover linha"${linhas.length < 2 ? ' disabled' : ''}>×</button>
  </div>`).join('');
}

/* ---------- no quadro (modal do equipamento) ---------- */
function listaPecasModal(e) {
  if (e.status === 'operando' || !e.paradaId) return '';
  const l = itensDaParada(e.paradaId);
  if (!l.length) return '';
  return `<div class="fs pk-modal"><span class="lb">Peças · ${esc(numeroParada(e.paradaId))} · ${esc(textoResumoPecas(e.paradaId))}</span>
    <div class="pk-mini">${l.map(i => { const s = situacaoItem(i); return `<div class="pk-li" data-s="${s.c}"><b>${esc(i.qtd)}×</b><span>${esc(i.descricao)}${i.codigo ? ` <small>${esc(i.codigo)}</small>` : ''}</span><em>${esc(s.t)}</em></div>`; }).join('')}</div></div>`;
}
function acoesPlanejamento(e) {
  const lista = listaPecasModal(e);
  const ir = e.paradaId && resumoPecas(e.paradaId).total ? `<div class="acoes"><button type="button" class="go" style="--k:var(--s-peca)" data-acao="irPecas">Abrir na página Peças</button></div>` : '';
  if (!lista) return '<p class="nota">O planejamento acompanha as solicitações de peças na página Peças.</p>';
  return lista + ir;
}
function formPecasHtml(e) {
  if (!aberto.linhas) aberto.linhas = [{ d: '', c: '', q: 1 }];
  const r = resumoPecas(e.paradaId);
  return `<div class="corr pk-form"><h4>${r.total ? 'Adicionar peças' : 'Solicitar peças'} · ${esc(numeroParada(e.paradaId))}</h4>
    <p class="nota" style="border-style:solid">O planejamento recebe a lista, informa a ordem de compra e marca a chegada. Enquanto houver peça pendente, o equipamento fica em <b>Peças solicitadas</b>; quando tudo chegar, volta para <b>Em manutenção</b>.</p>
    <div class="pl-cab"><span>Peça</span><span>Código</span><span>Qtd</span><span></span></div>
    <div class="pl-lista">${linhasHtml(aberto.linhas)}</div>
    <button type="button" class="lnk pl-add" data-acao="addLinha">+ Adicionar linha</button>
    ${aberto.err ? `<p class="erro">${esc(aberto.err)}</p>` : ''}
    <div class="acoes"><button type="button" class="go sec" style="--k:var(--muted)" data-acao="voltar">Voltar</button><button type="button" class="go" style="--k:var(--s-peca)" data-acao="enviarPecas">Enviar solicitação</button></div></div>`;
}
async function garantirParada(e) {
  if (e.paradaId && paradas[e.paradaId]) return e.paradaId;
  if (e.paradaId) { try { const s = await db.doc('paradas/' + e.paradaId).get(); if (s.exists) { paradas[e.paradaId] = s.data(); return e.paradaId; } } catch (er) {} }
  const par = paradaNova(e);
  await db.doc('paradas/' + par.id).set(par);
  await db.doc('equipamentos/' + e.tag).set({ ...e, paradaId: par.id });
  return par.id;
}
// Retorna true quando o clique foi tratado aqui.
async function cliquePecasModal(a, t, e) {
  if (a === 'modoPecas') { aberto.modo = 'pecas'; aberto.linhas = [{ d: '', c: '', q: 1 }]; aberto.err = ''; aberto.msg = null; renderModal(); const f = $('#dlg .pl-d'); if (f) f.focus(); return true; }
  if (a === 'irPecas') { fechar(); setVista('pecas'); return true; }
  if (a === 'addLinha' || a === 'rmLinha') {
    aberto.linhas = lerLinhas($('#dlg'));
    if (a === 'addLinha') aberto.linhas.push({ d: '', c: '', q: 1 }); else aberto.linhas.splice(Number(t.dataset.i), 1);
    renderModal();
    const ds = document.querySelectorAll('#dlg .pl-d'); if (a === 'addLinha' && ds.length) ds[ds.length - 1].focus();
    return true;
  }
  if (a === 'enviarPecas') {
    const linhas = lerLinhas($('#dlg'));
    aberto.linhas = linhas;
    const validas = linhas.filter(l => l.d);
    if (!validas.length) { aberto.err = 'Escreva pelo menos uma peça.'; renderModal(); return true; }
    if (validas.length !== linhas.filter(l => l.d || l.c).length) { aberto.err = 'Toda linha com código precisa da descrição da peça.'; renderModal(); return true; }
    t.disabled = true;
    try {
      const pid = await garantirParada(e);
      await criarItens(pid, validas);
    } catch (er) {
      t.disabled = false;
      aberto.err = er && er.status && er.status < 500 ? er.message : 'Não foi possível enviar. Tente de novo.';
      renderModal(); return true;
    }
    aberto.modo = null; aberto.linhas = null; aberto.err = '';
    aberto.msg = { txt: validas.length > 1 ? `${validas.length} peças enviadas ao planejamento.` : 'Peça enviada ao planejamento.', c: 'aguardando_peca' };
    renderModal(); const m = $('#dlg .okmsg'); if (m) m.focus();
    return true;
  }
  return false;
}

/* ---------- página Peças ---------- */
function gruposPecas() {
  const g = {};
  for (const i of Object.values(pecas)) (g[i.paradaId] = g[i.paradaId] || []).push(i);
  const q = pBusca.trim().toLowerCase();
  return Object.entries(g).map(([pid, itens]) => {
    itens.sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0) || (a.id < b.id ? -1 : 1));
    const ativos = itens.filter(i => !i.cancelada), pend = ativos.filter(i => !i.chegou);
    const par = paradas[pid] || null, tag = itens[0].tag, eq = equip[tag];
    const daParada = eq && eq.paradaId === pid;
    return { pid, itens, ativos, pend, par, tag, eq, daParada, numero: (par && par.numero) || itens[0].numero, ini: Math.min(...itens.map(i => i.criadoEm || Infinity)) };
  }).filter(x => {
    if (pFiltro === 'pendentes' && !x.pend.length) return false;
    if (pFiltro === 'semoc' && !x.pend.some(i => !i.oc)) return false;
    // "Todas" mostra as pendentes e as dos últimos 60 dias (a lista completa fica nos relatórios).
    if (pFiltro === 'todas' && !x.pend.length && Date.now() - Math.max(...x.itens.map(i => i.atualizadoEm || i.criadoEm || 0)) > 60 * 86400000) return false;
    if (!q) return true;
    return [x.tag, x.numero && 'parada nº ' + x.numero, x.numero, ...x.itens.flatMap(i => [i.descricao, i.codigo, i.oc])].join(' ').toLowerCase().includes(q);
  }).sort((a, b) => (b.pend.length > 0) - (a.pend.length > 0) || a.ini - b.ini);
}
function situacaoGrupo(x) {
  if (!x.eq) return { c: 'operando', t: 'Equipamento removido' };
  if (!x.daParada) return { c: 'operando', t: x.par && x.par.fim ? 'Parada encerrada' : 'Outra parada em andamento' };
  return { c: x.eq.status, t: ST[x.eq.status] ? ST[x.eq.status].rot : x.eq.status };
}
function renderPecasResumo() {
  const l = Object.values(pecas).filter(i => !i.cancelada);
  const pend = l.filter(i => !i.chegou);
  const reqs = new Set(pend.map(i => i.paradaId)).size;
  const semana = l.filter(i => i.chegou && Date.now() - (i.chegouEm || 0) < 7 * 86400000).length;
  $('#p-resumo').innerHTML = [['Solicitações abertas', reqs], ['Peças sem ordem de compra', pend.filter(i => !i.oc).length], ['Peças aguardando chegada', pend.filter(i => i.oc).length], ['Chegaram nos últimos 7 dias', semana]]
    .map(([l2, v]) => `<div class="k"><div class="k-l">${esc(l2)}</div><div class="k-v${v ? '' : ' zero'}">${esc(v)}</div></div>`).join('');
}
function renderPecas() {
  if (!$('#v-pecas') || $('#v-pecas').hidden) return;
  const guarda = {};
  document.querySelectorAll('#p-lista [data-keep]').forEach(el => { guarda[el.dataset.keep] = el.value; });
  const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.keep : null;
  renderPecasResumo();
  document.querySelectorAll('#p-filtro button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === pFiltro)));
  const plan = podePlanejar(), pedir = podePedirPecas();
  const grupos = gruposPecas();
  for (const id of [...pSel]) if (!pecas[id]) pSel.delete(id);
  $('#p-msg').textContent = pMsg; $('#p-msg').hidden = !pMsg;
  $('#p-lista').innerHTML = grupos.length ? grupos.map(x => {
    const s = situacaoGrupo(x), selG = x.itens.filter(i => pSel.has(i.id));
    const tipo = x.eq ? x.eq.tipo : 'adt';
    const linhas = x.itens.map(i => {
      const st = situacaoItem(i), bloqueado = i.cancelada;
      const oc = plan && !bloqueado && !i.chegou
        ? `<input type="text" class="p-oc" data-item="${esc(i.id)}" data-keep="oc:${esc(i.id)}" maxlength="30" placeholder="Nº da OC" value="${esc(i.oc || '')}" aria-label="Ordem de compra de ${esc(i.descricao)}">`
        : `<span class="${i.oc ? '' : 'nulo'}">${esc(i.oc || '—')}</span>`;
      const chegada = bloqueado ? '<span class="nulo">—</span>'
        : plan ? (i.chegou
          ? `<button type="button" class="p-cheg on" data-pa="desmarcar" data-item="${esc(i.id)}" title="Desfazer a chegada">✓ ${esc(dataHora(i.chegouEm))}</button>`
          : `<button type="button" class="p-cheg" data-pa="chegou" data-item="${esc(i.id)}">Marcar chegada</button>`)
        : (i.chegou ? `<span class="ok">✓ ${esc(dataHora(i.chegouEm))}</span>` : '<span class="nulo">Aguardando</span>');
      const canc = pedir && !bloqueado && !i.chegou
        ? `<button type="button" class="p-rm${pConfCancel === i.id ? ' conf' : ''}" data-pa="cancelar" data-item="${esc(i.id)}" aria-label="Cancelar item">${pConfCancel === i.id ? 'Confirmar' : '×'}</button>` : '';
      return `<tr data-s="${st.c}">
        ${plan ? `<td class="ck">${bloqueado || i.chegou ? '' : `<input type="checkbox" data-sel="${esc(i.id)}" aria-label="Selecionar ${esc(i.descricao)}"${pSel.has(i.id) ? ' checked' : ''}>`}</td>` : ''}
        <td class="pd"><b>${esc(i.descricao)}</b>${i.codigo ? `<small>${esc(i.codigo)}</small>` : ''}${i.cancelada ? '<small class="cx">Cancelada</small>' : ''}</td>
        <td class="n">${esc(i.qtd)}</td>
        <td class="pq"><span>${esc(i.criadoPor || '—')}</span><small>${esc(dataHora(i.criadoEm))}</small></td>
        <td class="po">${oc}</td>
        <td class="pc">${chegada}</td>
        <td class="px">${canc}</td></tr>`;
    }).join('');
    const massa = plan && x.pend.length > 1 ? `<div class="p-massa"><span>${selG.length ? `${selG.length} selecionada${selG.length > 1 ? 's' : ''}` : 'Selecione itens para usar a mesma OC'}</span>
      <input type="text" class="p-oc-massa" data-keep="massa:${esc(x.pid)}" maxlength="30" placeholder="Nº da OC" aria-label="Ordem de compra para os itens selecionados"${selG.length ? '' : ' disabled'}>
      <button type="button" class="ghost" data-pa="ocMassa" data-pid="${esc(x.pid)}"${selG.length ? '' : ' disabled'}>Aplicar aos selecionados</button>
      ${selG.length ? `<button type="button" class="ghost" data-pa="chegouMassa" data-pid="${esc(x.pid)}">Marcar chegada dos selecionados</button>` : ''}</div>` : '';
    const add = pedir && x.daParada && x.eq && x.eq.status !== 'liberado' ? `<div class="p-add"><input type="text" class="p-add-d" data-keep="add-d:${esc(x.pid)}" maxlength="80" placeholder="Adicionar peça" aria-label="Descrição da nova peça">
      <input type="text" class="p-add-c" data-keep="add-c:${esc(x.pid)}" maxlength="40" placeholder="Código" aria-label="Código da nova peça">
      <input type="number" class="p-add-q" data-keep="add-q:${esc(x.pid)}" min="1" step="1" value="1" inputmode="numeric" aria-label="Quantidade da nova peça">
      <button type="button" class="ghost" data-pa="adicionar" data-pid="${esc(x.pid)}">Adicionar</button></div>` : '';
    return `<section class="painel preq" data-pid="${esc(x.pid)}">
      <header class="pr-h">${icone(tipo)}<div><h3><span class="tg">${esc(x.tag)}</span>${x.numero ? `<span class="nr">Parada nº ${esc(x.numero)}</span>` : ''}<span class="st" data-c="${esc(s.c)}">${esc(s.t)}</span></h3>
        <p>${esc((x.par && x.par.motivo) || (x.eq && x.daParada && x.eq.motivo) || '')}${x.par && x.par.tecnico ? ' · Técnico: ' + esc(x.par.tecnico) : ''} · Primeira solicitação ${esc(dataHora(x.ini))}</p></div>
        <span class="pr-r">${x.ativos.length} ${x.ativos.length > 1 ? 'itens' : 'item'}<b>${x.ativos.length - x.pend.length} ${x.ativos.length - x.pend.length === 1 ? 'chegou' : 'chegaram'}</b></span></header>
      <div class="p-tab"><table><thead><tr>${plan ? '<th></th>' : ''}<th>Peça</th><th class="n">Qtd</th><th>Solicitada</th><th>Ordem de compra</th><th>Chegada</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>
      ${massa}${add}</section>`;
  }).join('') : `<p class="vazio p-vazio">${pFiltro === 'todas' && !pBusca ? 'Nenhuma solicitação de peças ainda.' : 'Nenhuma solicitação encontrada.'}</p>`;
  document.querySelectorAll('#p-lista [data-keep]').forEach(el => { if (guarda[el.dataset.keep] != null) el.value = guarda[el.dataset.keep]; });
  if (foco) { const el = document.querySelector(`#p-lista [data-keep="${CSS.escape(foco)}"]`); if (el) { el.focus(); try { const n = el.value.length; el.setSelectionRange(n, n); } catch (er) {} } }
}
function pAviso(txt) { pMsg = txt; clearTimeout(pAviso.t); pAviso.t = setTimeout(() => { pMsg = ''; renderPecas(); }, 5000); renderPecas(); }
async function acaoPecas(a, el) {
  const item = el.dataset.item ? pecas[el.dataset.item] : null;
  const agora = Date.now(), quem = (usuarioAtual() || {}).curto || '';
  try {
    if (a === 'chegou' && item) { await gravarItem(item, { chegou: true, chegouEm: agora, chegouPor: quem }); pSel.delete(item.id); }
    else if (a === 'desmarcar' && item) await gravarItem(item, { chegou: false, chegouEm: null, chegouPor: '' });
    else if (a === 'cancelar' && item) {
      if (pConfCancel !== item.id) { pConfCancel = item.id; renderPecas(); return; }
      pConfCancel = null; await gravarItem(item, { cancelada: true, canceladaEm: agora, canceladaPor: quem }); pSel.delete(item.id);
    } else if (a === 'ocMassa' || a === 'chegouMassa') {
      const sec = el.closest('.preq'), alvo = itensDaParada(el.dataset.pid).filter(i => pSel.has(i.id));
      if (a === 'ocMassa') {
        const v = (sec.querySelector('.p-oc-massa').value || '').trim();
        if (!v) { pAviso('Informe o número da ordem de compra.'); return; }
        for (const i of alvo) await gravarItem(i, { oc: v, ocEm: agora, ocPor: quem });
        sec.querySelector('.p-oc-massa').value = '';
        pAviso(`OC ${v} aplicada a ${alvo.length} ${alvo.length > 1 ? 'itens' : 'item'}.`);
      } else {
        for (const i of alvo) await gravarItem(i, { chegou: true, chegouEm: agora, chegouPor: quem });
        pAviso(`${alvo.length} ${alvo.length > 1 ? 'itens marcados' : 'item marcado'} como chegou.`);
      }
      alvo.forEach(i => pSel.delete(i.id));
    } else if (a === 'adicionar') {
      const sec = el.closest('.preq'), d = sec.querySelector('.p-add-d').value.trim();
      if (!d) { pAviso('Escreva a descrição da peça.'); sec.querySelector('.p-add-d').focus(); return; }
      await criarItens(el.dataset.pid, [{ d, c: sec.querySelector('.p-add-c').value.trim(), q: Math.max(1, Math.round(Number(sec.querySelector('.p-add-q').value) || 1)) }]);
      sec.querySelectorAll('.p-add input').forEach(x => { x.value = x.classList.contains('p-add-q') ? '1' : ''; });
      pAviso('Peça adicionada à solicitação.');
    }
  } catch (er) {
    pAviso(er && er.status && er.status < 500 ? er.message : 'Não foi possível salvar. Tente de novo.');
    return;
  }
  renderPecas();
}
$('#p-lista').addEventListener('click', ev => {
  const b = ev.target.closest('[data-pa]'); if (b) { if (b.dataset.pa !== 'cancelar') pConfCancel = null; acaoPecas(b.dataset.pa, b); }
});
$('#p-lista').addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.sel) { if (t.checked) pSel.add(t.dataset.sel); else pSel.delete(t.dataset.sel); renderPecas(); return; }
  if (t.classList.contains('p-oc')) {
    const item = pecas[t.dataset.item], v = t.value.trim();
    if (!item || v === (item.oc || '')) return;
    try { await gravarItem(item, { oc: v, ocEm: v ? Date.now() : null, ocPor: v ? (usuarioAtual() || {}).curto || '' : '' }); pAviso(v ? `OC ${v} salva.` : 'OC removida.'); }
    catch (er) { pAviso(er && er.status && er.status < 500 ? er.message : 'Não foi possível salvar. Tente de novo.'); }
  }
});
$('#p-lista').addEventListener('keydown', ev => {
  if (ev.key !== 'Enter') return;
  const t = ev.target;
  if (t.classList.contains('p-oc')) t.blur();
  else if (t.closest('.p-add')) { const b = t.closest('.p-add').querySelector('[data-pa="adicionar"]'); if (b) b.click(); }
  else if (t.classList.contains('p-oc-massa')) { const b = t.closest('.p-massa').querySelector('[data-pa="ocMassa"]'); if (b) b.click(); }
});
$('#p-filtro').addEventListener('click', ev => { const b = ev.target.closest('[data-f]'); if (!b) return; pFiltro = b.dataset.f; renderPecas(); });
$('#p-busca').addEventListener('input', ev => { pBusca = ev.target.value; renderPecas(); });
