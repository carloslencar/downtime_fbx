/* ---------- Preventivas por horímetro ----------
   - Cada equipamento tem a sua lista de preventivas agendadas pelo horímetro (coleção "preventivas",
     id = TAG): { agendadas: [{id, nome, horimetro}], historico: [...] }. Ex.: "PM 500" aos 5.000 h.
   - Leituras (coleção "leituras"): lançamento diário do horímetro pelo planejamento, com a data e a hora
     em que a leitura foi COLETADA. O servidor mantém o horímetro do equipamento e a média de horas por dia.
   - Painel: o cartão avisa quando a próxima preventiva está perto (config/preventiva.aviso, em horas) ou
     vencida. A operação manda o equipamento para a preventiva ("Mandar para preventiva"); quando a
     manutenção libera, o servidor tira a preventiva das agendadas e põe no histórico. */
let preventivas = {}, cfgPrev = { aviso: 50 }, leituras = {}, leiturasOn = false, leiturasVer = 0, idxLeit = null, idxVer = -1;
let pvTab = 'lista';
try { pvTab = localStorage.getItem('qp-pvtab') || 'lista'; } catch (e) {}
if (pvTab !== 'lista' && pvTab !== 'hor') pvTab = 'lista';
let pvFiltro = 'todos', pvBusca = '', pvAberto = null, pvConfFeita = null, pvConfRm = null, pvMsg = '', pvErr = '';
let hvColeta = null, hv = {}, hvBusca = '', hvFrota = '', hvHist = null, hvConfAvisos = false, hvErros = {}, hvSalvando = false, hvMsg = '', hvConfRm = null;
const DIA_MS = 86400000;

window.dt.db.doc('config/preventiva').onSnapshot(s => {
  cfgPrev = { aviso: 50, ...(s.exists ? s.data() : {}) };
  aoMudarPrev();
}, () => {});
window.dt.db.collection('preventivas').onSnapshot(snap => {
  for (const c of snap.docChanges()) { if (c.type === 'removed') delete preventivas[c.doc.id]; else preventivas[c.doc.id] = { ...c.doc.data() }; }
  aoMudarPrev();
}, () => {});
function ligarLeituras() {
  if (leiturasOn) return;
  leiturasOn = true;
  window.dt.db.collection('leituras').orderBy('capturadaEm', 'desc').limit(5000).onSnapshot(snap => {
    for (const c of snap.docChanges()) { if (c.type === 'removed') delete leituras[c.doc.id]; else leituras[c.doc.id] = { ...c.doc.data() }; }
    leiturasVer++;
    if (vista === 'preventivas' && pvTab === 'hor') renderHor();
  }, () => {});
}
function aoMudarPrev() {
  if (typeof render === 'function') render();
  if (vista === 'preventivas' && !$('#v-prev').hidden) renderPrev();
  if (aberto && !aberto.modo && typeof renderModal === 'function') renderModal();
}

/* ---------- próxima preventiva de cada equipamento ---------- */
function pvPlan() { return papel === 'planejador' || papel === 'admin'; }
function numN(v) { const n = Number(v); return v === '' || v == null || !isFinite(n) ? null : n; }
function fmtNum(n) { return Number(n).toLocaleString('pt-BR'); }
function diaMes(ms) { return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }
function dataCurta(ms) { return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function agendadasDe(tag) { const r = preventivas[tag]; return (r && Array.isArray(r.agendadas) ? r.agendadas : []).filter(a => numN(a.horimetro) != null).slice().sort((a, b) => a.horimetro - b.horimetro); }
function historicoPM(tag) { const r = preventivas[tag]; return r && Array.isArray(r.historico) ? r.historico : []; }
function avisoH() { const a = numN(cfgPrev.aviso); return a == null ? 50 : a; }
function infoAg(e, a) {
  const hor = numN(e.horimetro), media = numN(e.horimetroMedia);
  const faltam = hor == null ? null : Math.round((a.horimetro - hor) * 10) / 10;
  const previsao = faltam != null && faltam > 0 && media > 0 && e.horimetroEm ? e.horimetroEm + faltam / media * DIA_MS : null;
  return { ...a, faltam, previsao };
}
function estadoPM(e) {
  const ag = agendadasDe(e.tag).map(a => infoAg(e, a));
  const o = { ag, prox: ag[0] || null, aviso: avisoH(), hor: numN(e.horimetro), media: numN(e.horimetroMedia) };
  if (e.preventiva && e.status !== 'operando') { o.st = 'em_pm'; o.nome = e.preventiva.nome || 'Preventiva'; return o; }
  if (!o.prox) { o.st = 'sem'; return o; }
  o.nome = o.prox.nome || 'Preventiva'; o.faltam = o.prox.faltam; o.previsao = o.prox.previsao;
  o.st = o.faltam == null ? 'ok' : o.faltam <= 0 ? 'vencida' : o.faltam <= o.aviso ? 'proxima' : 'ok';
  return o;
}
// Preventiva usada quando a operação abre a parada com o motivo "Preventiva".
function pmPadrao(e) { const p = agendadasDe(e.tag)[0]; return p ? { id: p.id, nome: p.nome || 'Preventiva', alvo: p.horimetro } : { id: '', nome: 'Preventiva', alvo: null }; }
const ST_PM = { vencida: 'Vencida', proxima: 'Próxima', em_pm: 'Em preventiva', sem: 'Sem agendamento', ok: 'Em dia' };
function faltamTxt(f) { if (f == null) return '—'; return f <= 0 ? `vencida há ${fmtNum(Math.round(-f))} h` : `faltam ${fmtNum(Math.round(f))} h`; }

/* ---------- no painel ---------- */
function marcarPM(b, e) {
  const o = estadoPM(e);
  const pm = o.st === 'vencida' || o.st === 'proxima' || o.st === 'em_pm' ? o.st : '';
  b.dataset.pm = pm;
  let bd = b.querySelector('.eq-pm');
  if (pm && !bd) { bd = document.createElement('span'); bd.className = 'eq-pm'; b.querySelector('.eq-top').appendChild(bd); }
  if (bd) { bd.hidden = !pm; bd.textContent = 'PM'; }
  if (!pm || e.status !== 'operando') return;
  b.querySelector('.eq-rot').textContent = o.nome;
  b.querySelector('.eq-tm').textContent = o.st === 'vencida' ? 'vencida' : fmtNum(Math.round(o.faltam)) + ' h';
  b.title = `${e.tag} · Operando · ${o.nome} · ${faltamTxt(o.faltam)}`;
  b.setAttribute('aria-label', b.title);
}
function pmModalHtml(e) {
  const o = estadoPM(e);
  if (o.st === 'em_pm') return `<div class="pm-box" data-st="em_pm"><span class="lb">Parada preventiva · ${esc(o.nome)}</span><p>Ao liberar o equipamento, a preventiva sai da lista de agendadas e fica registrada como feita.</p></div>`;
  if (o.st === 'sem') return '';
  const outras = o.ag.slice(1, 4);
  const bt = papel === 'operacao' && e.status === 'operando' ? `<div class="acoes"><button type="button" class="go${o.st === 'ok' ? ' sec' : ''}" style="--k:var(--s-pm)" data-acao="modoPM">Mandar para preventiva</button></div>` : '';
  return `<div class="pm-box" data-st="${o.st}"><span class="lb">Preventiva · ${esc(ST_PM[o.st])}</span>
    <p><b>${esc(o.nome)}</b> no horímetro <b>${fmtH(o.prox.horimetro)}</b> · ${esc(faltamTxt(o.faltam))}${o.previsao ? ` · previsão ${esc(diaMes(o.previsao))}` : ''}</p>
    ${outras.length ? `<p class="pm-det">Depois: ${outras.map(a => esc((a.nome || 'Preventiva') + ' em ' + fmtH(a.horimetro))).join(' · ')}</p>` : ''}${bt}</div>`;
}
function formPMHtml(e) {
  const ag = agendadasDe(e.tag);
  const opts = [...ag.map((a, i) => `<option value="${esc(a.id)}">${esc((a.nome || 'Preventiva') + ' · ' + fmtH(a.horimetro))}${i === 0 ? ' (a próxima)' : ''}</option>`), '<option value="">Preventiva não agendada</option>'];
  return `<div class="corr pm-form"><h4>Mandar para preventiva</h4>
    <p class="nota" style="border-style:solid">O equipamento entra na fila da manutenção como <b>parada preventiva</b>. Quando a manutenção liberar, a preventiva fica registrada como feita.</p>
    <div class="fs"><label for="pm-tipo">Preventiva</label><select id="pm-tipo">${opts.join('')}</select></div>
    <div class="fs"><label for="obs">Observação</label><input type="text" id="obs" maxlength="80" placeholder="Programada com a manutenção"></div>
    ${horCampo(e)}${aberto.err ? `<p class="erro">${esc(aberto.err)}</p>` : ''}
    <div class="acoes"><button type="button" class="go sec" style="--k:var(--muted)" data-acao="voltar">Voltar</button><button type="button" class="go" style="--k:var(--s-pm)" data-acao="confPM">Mandar para preventiva</button></div></div>`;
}
async function cliquePMModal(a, t, e) {
  if (a === 'modoPM') { aberto.modo = 'pm'; aberto.err = ''; aberto.msg = null; renderModal(); const s = $('#pm-tipo'); if (s) s.focus(); return true; }
  if (a !== 'confPM') return false;
  const id = $('#pm-tipo').value, ag = agendadasDe(e.tag).find(x => x.id === id);
  const pm = ag ? { id: ag.id, nome: ag.nome || 'Preventiva', alvo: ag.horimetro } : { id: '', nome: 'Preventiva', alvo: null };
  const obs = ($('#obs').value || '').trim();
  const h = lerHor(e, t); if (!h.ok) return true;
  const d = { obs }; if (h.val != null) d.hor = h.val;
  t.disabled = true;
  const ok = await aplicar('abrir', e.tag, { status: 'aguardando', motivo: 'Preventiva', obs: (ag ? pm.nome : '') + (ag && obs ? ' · ' : '') + obs, tecnico: '', inicioParada: Date.now(), preventiva: pm, ...horPatch(d) },
    { por: 'Operação' + nomeSessao(), detalhe: 'Preventiva' + (ag ? ' · ' + pm.nome : '') + (obs ? ' · ' + obs : '') + horTxt(d), hor: d.hor ?? null });
  if (ok === false) { t.disabled = false; return true; }
  aberto.modo = null; aberto.err = ''; aberto.st = null;
  aberto.msg = { txt: `Enviado para a preventiva (${pm.nome}). A manutenção já vê este equipamento na fila.`, c: 'aguardando' };
  renderModal(); const m = $('#dlg .okmsg'); if (m) m.focus();
  return true;
}

/* ---------- página: abas ---------- */
function renderPrev() {
  if ($('#v-prev').hidden) return;
  const plan = pvPlan();
  if (!plan && pvTab !== 'lista') pvTab = 'lista';
  document.querySelectorAll('#pv-tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pt === pvTab)));
  $('#pv-tabs').hidden = !plan;
  $('#pv-lista-v').hidden = pvTab !== 'lista'; $('#pv-hor-v').hidden = pvTab !== 'hor';
  $('#pv-sub').textContent = pvTab === 'hor' ? 'Lançamento diário do horímetro de cada equipamento. O horímetro do quadro passa a ser a leitura com a coleta mais recente.'
    : 'Agende as preventivas de cada equipamento pelo horímetro. A previsão usa o uso médio dos últimos 30 dias.';
  if (pvTab === 'lista') renderPvLista();
  else { ligarLeituras(); renderHor(); }
}
$('#pv-tabs').addEventListener('click', ev => {
  const b = ev.target.closest('[data-pt]'); if (!b) return;
  pvTab = b.dataset.pt; try { localStorage.setItem('qp-pvtab', pvTab); } catch (e) {}
  renderPrev();
});

/* ---------- aba Preventivas: lista de equipamentos com as agendadas ---------- */
const RANK_PM = { vencida: 0, em_pm: 1, proxima: 2, ok: 3, sem: 4 };
function pvAvisar(t) { pvMsg = t; clearTimeout(pvAvisar.t); pvAvisar.t = setTimeout(() => { pvMsg = ''; const m = $('#pv-msg'); if (m) m.hidden = true; }, 6000); const m = $('#pv-msg'); m.textContent = t; m.hidden = !t; }
function renderPvLista() {
  const todas = Object.values(equip).filter(e => e.ativo !== false && daTela(e)).map(e => ({ e, o: estadoPM(e) }));
  const c = { vencida: 0, proxima: 0, em_pm: 0, sem: 0, ok: 0 };
  for (const x of todas) c[x.o.st]++;
  const plan = pvPlan();
  $('#pv-resumo').innerHTML = [['Vencidas', c.vencida, 'vencida'], ['Próximas', c.proxima, 'proxima'], ['Em preventiva agora', c.em_pm, ''], ['Em dia', c.ok, ''], ['Sem agendamento', c.sem, '']]
    .map(([l, v, k]) => `<div class="k"${k ? ` data-pmk="${k}"` : ''}><div class="k-l">${esc(l)}</div><div class="k-v${v ? '' : ' zero'}">${esc(v)}</div></div>`).join('')
    + `<div class="k"><div class="k-l">Avisar quando faltarem</div><div class="pv-aviso">${plan ? `<input type="number" id="pv-aviso" min="0" max="2000" step="5" inputmode="numeric" value="${esc(avisoH())}" aria-label="Avisar quando faltarem (h)">` : `<b>${esc(avisoH())}</b>`}<span>h</span></div></div>`;
  document.querySelectorAll('#pv-filtro button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === pvFiltro)));
  $('#pv-msg').textContent = pvMsg; $('#pv-msg').hidden = !pvMsg;
  const q = pvBusca.trim().toLowerCase();
  const l = todas.filter(x => (pvFiltro === 'todos' || (pvFiltro === 'atencao' ? ['vencida', 'proxima', 'em_pm'].includes(x.o.st) : x.o.st === 'sem')) &&
    (!q || [x.e.tag, x.e.modelo, (frotaDe(x.e.grupo) || {}).nome, ...x.o.ag.map(a => a.nome)].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (RANK_PM[a.o.st] - RANK_PM[b.o.st]) || ((a.o.faltam ?? 1e9) - (b.o.faltam ?? 1e9)) || cmpTag(a.e.tag, b.e.tag));
  const guarda = {}; document.querySelectorAll('#pv-tab [data-keep]').forEach(el => { guarda[el.dataset.keep] = el.value; });
  const ae = document.activeElement, foco = ae && ae.dataset && ae.dataset.keep;
  const linhas = l.map(({ e, o }) => {
    const fr = frotaDe(e.grupo);
    const hor = o.hor == null ? '<span class="nulo">sem leitura</span>' : `<b>${fmtH(o.hor)}</b>${o.media != null ? `<small>${String(o.media).replace('.', ',')} h/dia</small>` : '<small>sem média ainda</small>'}`;
    const prox = o.st === 'em_pm' ? `<b>${esc(o.nome)}</b><small>em andamento</small>` : o.prox ? `<b>${esc(o.prox.nome || 'Preventiva')}</b> em ${fmtH(o.prox.horimetro)}` : '<span class="nulo">—</span>';
    const falt = o.prox && o.st !== 'em_pm' && o.faltam != null ? `<span class="pv-f${o.faltam <= 0 ? ' neg' : ''}">${o.faltam <= 0 ? '+' + fmtNum(Math.round(-o.faltam)) : fmtNum(Math.round(o.faltam))} h</span><small>${o.faltam <= 0 ? 'vencida' : 'faltam'}</small>` : '<span class="nulo">—</span>';
    const prev = o.previsao && o.st !== 'em_pm' ? esc(diaMes(o.previsao)) : '<span class="nulo">—</span>';
    const outras = o.ag.slice(o.st === 'em_pm' ? 0 : 1);
    const outrasTxt = outras.length ? outras.slice(0, 3).map(a => `<span class="pv-ag">${esc(a.nome || 'Preventiva')} · ${fmtH(a.horimetro)}</span>`).join('') + (outras.length > 3 ? `<span class="pv-ag">+${outras.length - 3}</span>` : '') : '<span class="nulo">—</span>';
    const aberto2 = pvAberto === e.tag;
    return `<tr data-st="${o.st}"${aberto2 ? ' class="pv-aberta"' : ''}><td><div class="pv-eq">${icone(e.tipo)}<span><b>${esc(e.tag)}</b><span class="pv-chip" data-st="${o.st}">${esc(ST_PM[o.st])}</span><small>${esc(fr ? fr.nome : '')}</small></span></div></td>
      <td>${hor}</td><td>${prox}</td><td class="n">${falt}</td><td>${prev}</td><td class="pv-outras">${outrasTxt}</td>
      <td class="pv-ac"><button type="button" class="ghost-sm" data-pv="abrir" data-tag="${esc(e.tag)}">${aberto2 ? 'Fechar' : plan ? (o.ag.length ? 'Agendar / editar' : 'Agendar') : 'Ver'}</button></td></tr>
      ${aberto2 ? `<tr class="pv-sub"><td colspan="7">${painelEqHtml(e, o, plan)}</td></tr>` : ''}`;
  }).join('');
  $('#pv-tab').innerHTML = l.length ? `<div class="p-tab pvt"><table><thead><tr><th>Equipamento</th><th>Horímetro atual</th><th>Próxima preventiva</th><th class="n">Faltam</th><th>Previsão</th><th>Depois</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
    : `<p class="vazio p-vazio">${pvFiltro === 'atencao' && !q ? 'Nenhuma preventiva vencida ou próxima.' : 'Nenhum equipamento encontrado.'}</p>`;
  document.querySelectorAll('#pv-tab [data-keep]').forEach(el => { if (guarda[el.dataset.keep] != null) el.value = guarda[el.dataset.keep]; });
  if (foco) { const el = document.querySelector(`#pv-tab [data-keep="${CSS.escape(foco)}"]`); if (el) el.focus(); }
}
function painelEqHtml(e, o, plan) {
  const ag = o.ag, h = historicoPM(e.tag).slice().reverse().slice(0, 5);
  const ultAg = ag[ag.length - 1], penAg = ag[ag.length - 2];
  const sugHor = ultAg && penAg ? ultAg.horimetro + (ultAg.horimetro - penAg.horimetro) : '';
  const linhas = ag.map(a => `<div class="pv-agl" data-id="${esc(a.id)}">
      ${plan ? `<input type="text" class="pv-ag-nome" data-keep="n:${esc(e.tag)}:${esc(a.id)}" maxlength="40" value="${esc(a.nome || '')}" placeholder="Preventiva" aria-label="Nome da preventiva">
      <input type="text" inputmode="decimal" class="pv-ag-hor" data-keep="h:${esc(e.tag)}:${esc(a.id)}" value="${esc(a.horimetro)}" aria-label="Horímetro da preventiva">` : `<b>${esc(a.nome || 'Preventiva')}</b><span>${fmtH(a.horimetro)}</span>`}
      <span class="pv-agf${a.faltam != null && a.faltam <= 0 ? ' neg' : ''}">${esc(faltamTxt(a.faltam))}${a.previsao ? ' · ' + esc(diaMes(a.previsao)) : ''}</span>
      ${plan ? `<button type="button" class="ghost-sm${pvConfFeita === a.id ? ' conf' : ''}" data-pv="feita" data-tag="${esc(e.tag)}" data-id="${esc(a.id)}">${pvConfFeita === a.id ? `Confirmar: feita em ${o.hor == null ? '—' : fmtH(o.hor)}` : 'Marcar feita'}</button>
      <button type="button" class="p-rm${pvConfRm === a.id ? ' conf' : ''}" data-pv="rm" data-tag="${esc(e.tag)}" data-id="${esc(a.id)}" aria-label="Remover preventiva">${pvConfRm === a.id ? 'Confirmar' : '×'}</button>` : ''}</div>`).join('');
  return `<div class="pv-painel">
    <div class="pv-pcol"><h4>Agendadas · ${esc(e.tag)}</h4>
      ${linhas || '<p class="vazio">Nenhuma preventiva agendada.</p>'}
      ${plan ? `<div class="pv-add"><input type="text" id="pv-add-nome" data-keep="an:${esc(e.tag)}" maxlength="40" placeholder="Nome (ex.: PM 500)" aria-label="Nome da nova preventiva">
        <input type="text" inputmode="decimal" id="pv-add-hor" data-keep="ah:${esc(e.tag)}" value="${esc(sugHor)}" placeholder="Horímetro (h)" aria-label="Horímetro da nova preventiva">
        <button type="button" class="salvar" data-pv="add" data-tag="${esc(e.tag)}">Agendar</button></div>
        <p class="dica">Agende quantas quiser. O painel avisa a mais próxima.${sugHor !== '' ? ' O horímetro sugerido repete o intervalo das duas últimas.' : ''}</p>` : ''}
      ${pvErr ? `<p class="erro">${esc(pvErr)}</p>` : ''}</div>
    <div class="pv-pcol"><h4>Feitas</h4>${h.length ? h.map(x => `<div class="pv-hl"><b>${esc(x.nome || 'Preventiva')}</b><span>${x.horimetro != null ? fmtH(x.horimetro) : '—'}</span><span>${esc(dataCurta(x.em))}</span><small>${x.origem === 'parada' ? 'Parada' + (x.numero ? ' nº ' + esc(x.numero) : '') : 'Marcada pelo planejamento'}${x.por ? ' · ' + esc(x.por) : ''}</small></div>`).join('') : '<p class="vazio">Nenhuma preventiva feita ainda.</p>'}</div></div>`;
}
async function gravarPrev(tag, patch) {
  const atual = preventivas[tag] || { tag, agendadas: [], historico: [] };
  const doc = { agendadas: [], historico: [], ...atual, ...patch, tag, atualizadoEm: Date.now(), atualizadoPor: (usuarioAtual() || {}).curto || '' };
  doc.agendadas = doc.agendadas.slice().sort((a, b) => a.horimetro - b.horimetro);
  await db.doc('preventivas/' + tag).set(doc);
}
function erroMsg(er) { return er && er.status && er.status < 500 ? er.message : 'Não foi possível salvar. Tente de novo.'; }
$('#pv-tab').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-pv]'); if (!b) return;
  const a = b.dataset.pv, tag = b.dataset.tag, id = b.dataset.id;
  if (a !== 'feita') pvConfFeita = null;
  if (a !== 'rm') pvConfRm = null;
  if (a === 'abrir') { pvAberto = pvAberto === tag ? null : tag; pvErr = ''; renderPvLista(); const f = $('#pv-add-hor'); if (f && pvAberto) f.focus(); return; }
  if (a === 'add') {
    const nome = ($('#pv-add-nome').value || '').trim(), hor = numBR($('#pv-add-hor').value);
    if (hor == null || !isFinite(hor) || hor < 0) { pvErr = 'Informe o horímetro em que a preventiva deve ser feita.'; renderPvLista(); $('#pv-add-hor').focus(); return; }
    if (agendadasDe(tag).some(x => x.horimetro === hor && (x.nome || '') === nome)) { pvErr = 'Essa preventiva já está agendada.'; renderPvLista(); return; }
    pvErr = ''; b.disabled = true;
    try { await gravarPrev(tag, { agendadas: [...agendadasDe(tag), { id: 'a' + Date.now().toString(36), nome: nome || 'Preventiva', horimetro: hor, criadaEm: Date.now(), criadaPor: (usuarioAtual() || {}).curto || '' }] }); }
    catch (er) { b.disabled = false; pvErr = erroMsg(er); renderPvLista(); return; }
    pvAvisar(`${nome || 'Preventiva'} agendada para ${tag} em ${fmtH(hor)}.`);
    renderPvLista();
    const ag = agendadasDe(tag), u = ag[ag.length - 1], pu = ag[ag.length - 2];
    const n = $('#pv-add-nome'), h2 = $('#pv-add-hor');
    if (n) n.value = '';
    if (h2) { h2.value = u && pu ? String(u.horimetro + (u.horimetro - pu.horimetro)) : ''; h2.focus(); h2.select(); }
    return;
  }
  if (a === 'feita') {
    if (pvConfFeita !== id) { pvConfFeita = id; renderPvLista(); return; }
    pvConfFeita = null;
    const e = equip[tag], ag = agendadasDe(tag).find(x => x.id === id); if (!ag) return;
    try {
      await gravarPrev(tag, { agendadas: agendadasDe(tag).filter(x => x.id !== id),
        historico: [...historicoPM(tag), { id, nome: ag.nome, alvo: ag.horimetro, horimetro: numN(e.horimetro), em: Date.now(), origem: 'manual', por: (usuarioAtual() || {}).curto || '', agendada: ag }] });
      pvAvisar(`${ag.nome || 'Preventiva'} de ${tag} marcada como feita.`);
    } catch (er) { pvAvisar(erroMsg(er)); }
    renderPvLista(); return;
  }
  if (a === 'rm') {
    if (pvConfRm !== id) { pvConfRm = id; renderPvLista(); return; }
    pvConfRm = null;
    try { await gravarPrev(tag, { agendadas: agendadasDe(tag).filter(x => x.id !== id) }); pvAvisar('Preventiva removida da agenda.'); }
    catch (er) { pvAvisar(erroMsg(er)); }
    renderPvLista();
  }
});
$('#pv-tab').addEventListener('change', async ev => {
  const t = ev.target, row = t.closest('.pv-agl'); if (!row) return;
  const tag = pvAberto, id = row.dataset.id, lista = agendadasDe(tag), ag = lista.find(x => x.id === id); if (!ag) return;
  const nome = row.querySelector('.pv-ag-nome').value.trim() || 'Preventiva', hor = numBR(row.querySelector('.pv-ag-hor').value);
  if (hor == null || !isFinite(hor) || hor < 0) { pvErr = 'Horímetro inválido.'; renderPvLista(); return; }
  if (nome === ag.nome && hor === ag.horimetro) return;
  pvErr = '';
  try { await gravarPrev(tag, { agendadas: lista.map(x => x.id === id ? { ...x, nome, horimetro: hor } : x) }); pvAvisar('Preventiva atualizada.'); }
  catch (er) { pvAvisar(erroMsg(er)); }
});
$('#pv-tab').addEventListener('keydown', ev => {
  if (ev.key !== 'Enter') return;
  if (ev.target.closest('.pv-add')) { ev.preventDefault(); const b = $('#pv-tab [data-pv="add"]'); if (b) b.click(); }
  else if (ev.target.closest('.pv-agl')) ev.target.blur();
});
$('#pv-resumo').addEventListener('change', async ev => {
  if (ev.target.id !== 'pv-aviso') return;
  const v = Math.max(0, Math.round(Number(ev.target.value) || 0));
  try { await db.doc('config/preventiva').set({ ...cfgPrev, aviso: v }); pvAvisar(`O painel avisa quando faltarem ${v} h.`); }
  catch (er) { pvAvisar(erroMsg(er)); }
});
$('#pv-filtro').addEventListener('click', ev => { const b = ev.target.closest('[data-f]'); if (!b) return; pvFiltro = b.dataset.f; renderPvLista(); });
$('#pv-busca').addEventListener('input', ev => { pvBusca = ev.target.value; renderPvLista(); });

/* ---------- aba Horímetros (lançamento diário) ---------- */
function numBR(s) {
  s = String(s ?? '').trim().replace(/\s+/g, '').replace(/h$/i, '');
  if (!s) return null;
  if (typeof LANG !== 'undefined' && LANG === 'en') s = s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}
function indiceLeituras() {
  if (idxLeit && idxVer === leiturasVer) return idxLeit;
  idxLeit = {};
  for (const l of Object.values(leituras)) (idxLeit[l.tag] = idxLeit[l.tag] || []).push(l);
  for (const k in idxLeit) idxLeit[k].sort((a, b) => a.capturadaEm - b.capturadaEm || (a.id < b.id ? -1 : 1));
  idxVer = leiturasVer;
  return idxLeit;
}
function leiturasTag(tag) { return indiceLeituras()[tag] || []; }
function coletaTela() { return hvColeta || (hvColeta = Math.floor(Date.now() / 60000) * 60000); }
function vizinhos(e, t) {
  const l = leiturasTag(e.tag);
  if (!l.length && numN(e.horimetro) != null) return { prev: e.horimetroEm && e.horimetroEm <= t ? { valor: Number(e.horimetro), capturadaEm: e.horimetroEm } : null, next: null };
  let prev = null, next = null;
  for (const x of l) { if (x.capturadaEm <= t) prev = x; else { next = x; break; } }
  return { prev, next };
}
// Confere uma linha: { v, t, nivel: ''|'ok'|'aviso'|'erro', txt }
function conferirLinha(e) {
  const st = hv[e.tag] || {};
  const v = numBR(st.v), t = st.t || coletaTela();
  if (v == null) return { v: null, t, nivel: '', txt: '' };
  if (!isFinite(v) || v < 0) return { v, t, nivel: 'erro', txt: 'Número inválido' };
  if (t > Date.now() + 600000) return { v, t, nivel: 'erro', txt: 'Horário da coleta no futuro' };
  const { prev, next } = vizinhos(e, t);
  if (prev && v < prev.valor) return { v, t, nivel: 'erro', txt: `Menor que a leitura de ${dataHora(prev.capturadaEm)} (${fmtH(prev.valor)})` };
  if (next && v > next.valor) return { v, t, nivel: 'erro', txt: `Maior que a leitura de ${dataHora(next.capturadaEm)} (${fmtH(next.valor)})` };
  if (!prev) return { v, t, nivel: 'ok', txt: 'Primeira leitura' };
  const dh = Math.round((v - prev.valor) * 10) / 10, dt = Math.max(0, (t - prev.capturadaEm) / 3600000);
  const base = `+${fmtNum(dh)} h em ${dt >= 48 ? fmtNum(Math.round(dt / 24)) + ' dias' : fmtNum(Math.round(dt)) + ' h'}`;
  if (dh > dt + 0.5) return { v, t, nivel: 'aviso', txt: base + ' · mais horas que o tempo passado' };
  return { v, t, nivel: 'ok', txt: base };
}
function equipsHor() {
  const q = hvBusca.trim().toLowerCase();
  return Object.values(equip).filter(e => e.ativo !== false && daTela(e) && (!hvFrota || e.grupo === hvFrota) && (!q || [e.tag, e.modelo].join(' ').toLowerCase().includes(q)));
}
function mesmoDia(a, b) { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); }
function lidoNoDia(e, t) { return leiturasTag(e.tag).some(l => mesmoDia(l.capturadaEm, t)); }
function hvAvisar(t) { hvMsg = t; clearTimeout(hvAvisar.t); hvAvisar.t = setTimeout(() => { hvMsg = ''; const m = $('#hv-msg'); if (m) m.hidden = true; }, 8000); const m = $('#hv-msg'); m.textContent = t; m.hidden = !t; }
function ultCelula(e) {
  const h = numN(e.horimetro);
  if (h == null) return '<span class="nulo">Sem leitura</span>';
  const ha = e.horimetroEm ? Date.now() - e.horimetroEm : null;
  const hTxt = ha == null ? '' : ha < 3600000 ? 'agora há pouco' : ha < 2 * DIA_MS ? `há ${fmtNum(Math.round(ha / 3600000))} h` : `há ${fmtNum(Math.round(ha / DIA_MS))} dias`;
  return `<b>${fmtH(h)}</b><small>${e.horimetroEm ? esc(dataHora(e.horimetroEm)) + ' · ' + esc(hTxt) : ''}</small>${e.horimetroMedia != null ? `<small>média ${String(e.horimetroMedia).replace('.', ',')} h/dia</small>` : ''}`;
}
function difCelula(e) {
  const r = conferirLinha(e), er = hvErros[e.tag];
  if (er) return `<span class="hv-d erro">${esc(er)}</span>`;
  return r.txt ? `<span class="hv-d ${r.nivel}">${esc(r.txt)}</span>` : '';
}
function horaCelula(e) {
  const st = hv[e.tag] || {};
  if (st.t) return `<div class="hv-hr"><input type="datetime-local" class="hv-t" data-tag="${esc(e.tag)}" step="60" value="${toLocal(st.t)}" aria-label="Horário da coleta de ${esc(e.tag)}"><button type="button" class="pl-x" data-hv="tTopo" data-tag="${esc(e.tag)}" aria-label="Usar o horário do topo">×</button></div>`;
  return `<span class="hv-topo">${esc(dataHora(coletaTela()))}</span><button type="button" class="lnk" data-hv="tOutro" data-tag="${esc(e.tag)}">outro horário</button>`;
}
function renderHor() {
  if ($('#pv-hor-v').hidden) return;
  const ae = document.activeElement, foco = ae && ae.dataset && ae.dataset.tag && ae.classList.contains('hv-in') ? ae.dataset.tag : null;
  const selIni = foco ? ae.selectionStart : null;
  const ci = $('#hv-coleta'); if (document.activeElement !== ci) ci.value = toLocal(coletaTela());
  const fs = $('#hv-frota');
  fs.innerHTML = `<option value="">Todas as frotas</option>` + frotas.map(f => `<option value="${esc(f.id)}"${f.id === hvFrota ? ' selected' : ''}>${esc(f.nome)}</option>`).join('');
  const lista = equipsHor(), t0 = coletaTela();
  const feitos = lista.filter(e => lidoNoDia(e, t0)).length;
  $('#hv-prog').innerHTML = `<b>${feitos}</b> de ${lista.length} com leitura em ${esc(diaMes(t0))}`;
  const n = lista.filter(e => conferirLinha(e).v != null).length;
  const bs = $('#hv-salvar'); bs.textContent = hvConfAvisos ? 'Confirmar e salvar' : n ? `Salvar ${n} ${n === 1 ? 'leitura' : 'leituras'}` : 'Salvar leituras'; bs.disabled = hvSalvando; bs.classList.toggle('conf', hvConfAvisos);
  const m = $('#hv-msg'); m.textContent = hvMsg; m.hidden = !hvMsg;
  const grupos = [...frotas, { id: '_sem', nome: 'Sem frota' }];
  let h = '';
  for (const f of grupos) {
    const it = lista.filter(e => f.id === '_sem' ? !frotaDe(e.grupo) : e.grupo === f.id).sort((a, b) => cmpTag(a.tag, b.tag));
    if (!it.length) continue;
    h += `<tr class="hv-fh"><th colspan="6">${esc(f.nome)}<span>${it.filter(e => lidoNoDia(e, t0)).length}/${it.length}</span></th></tr>`;
    for (const e of it) {
      const r = conferirLinha(e), lido = lidoNoDia(e, t0), st = hv[e.tag] || {};
      h += `<tr data-tag="${esc(e.tag)}" data-s="${hvErros[e.tag] ? 'erro' : r.nivel}"${lido ? ' data-lido="1"' : ''}>
        <td><div class="hv-eq">${icone(e.tipo)}<span><b>${esc(e.tag)}</b><small>${esc(e.modelo || '')}</small></span>${lido ? '<i class="hv-ok" title="Já tem leitura nesta data">✓</i>' : ''}</div></td>
        <td class="hv-ult">${ultCelula(e)}</td>
        <td class="hv-nv"><input type="text" inputmode="decimal" class="hv-in" data-tag="${esc(e.tag)}" value="${esc(st.v || '')}" placeholder="${numN(e.horimetro) != null ? esc(fmtNum(Math.round(e.horimetro))) : 'h'}" aria-label="Nova leitura de ${esc(e.tag)}" autocomplete="off"></td>
        <td class="hv-quando">${horaCelula(e)}</td>
        <td class="hv-dif">${difCelula(e)}</td>
        <td class="hv-hb"><button type="button" class="lnk" data-hv="hist" data-tag="${esc(e.tag)}">${hvHist === e.tag ? 'Fechar' : 'Histórico'}</button></td></tr>`;
      if (hvHist === e.tag) h += `<tr class="hv-histr"><td colspan="6">${histLeiturasHtml(e)}</td></tr>`;
    }
  }
  $('#hv-tab').innerHTML = h ? `<div class="p-tab hvt"><table><thead><tr><th class="c-eq">Equipamento</th><th class="c-ul">Última leitura</th><th class="c-nv">Nova leitura (h)</th><th class="c-qd">Horário da coleta</th><th>Diferença</th><th class="c-hb"></th></tr></thead><tbody>${h}</tbody></table></div>` : '<p class="vazio p-vazio">Nenhum equipamento encontrado.</p>';
  if (foco) { const el = document.querySelector(`#hv-tab .hv-in[data-tag="${CSS.escape(foco)}"]`); if (el) { el.focus(); try { el.setSelectionRange(selIni, selIni); } catch (e) {} } }
}
function histLeiturasHtml(e) {
  const l = leiturasTag(e.tag).slice().reverse().slice(0, 12), plan = pvPlan();
  const ORIG = { diaria: 'Lançamento diário', parada: 'Parada', cadastro: 'Cadastro', correcao: 'Correção', inicial: 'Leitura inicial' };
  if (!l.length) return '<p class="vazio">Nenhuma leitura registrada.</p>';
  return `<div class="hv-hist">${l.map(x => `<div class="hv-hl"><b>${fmtH(x.valor)}</b><span>coletada ${esc(dataHora(x.capturadaEm))}</span><small>${esc(ORIG[x.origem] || x.origem || '')}${x.lancadaPor ? ' · ' + esc(x.lancadaPor) : ''}${x.lancadaEm && Math.abs(x.lancadaEm - x.capturadaEm) > 15 * 60000 ? ' · lançada ' + esc(dataHora(x.lancadaEm)) : ''}</small>${plan ? `<button type="button" class="p-rm${hvConfRm === x.id ? ' conf' : ''}" data-hv="rm" data-id="${esc(x.id)}" aria-label="Remover leitura">${hvConfRm === x.id ? 'Confirmar' : '×'}</button>` : ''}</div>`).join('')}</div>`;
}
function atualizarLinha(tag) {
  const e = equip[tag], tr = document.querySelector(`#hv-tab tr[data-tag="${CSS.escape(tag)}"]`); if (!e || !tr) return;
  const r = conferirLinha(e);
  tr.dataset.s = hvErros[tag] ? 'erro' : r.nivel;
  tr.querySelector('.hv-dif').innerHTML = difCelula(e);
  const lista = equipsHor(), n = lista.filter(x => conferirLinha(x).v != null).length, bs = $('#hv-salvar');
  if (!hvConfAvisos) bs.textContent = n ? `Salvar ${n} ${n === 1 ? 'leitura' : 'leituras'}` : 'Salvar leituras';
}
$('#hv-tab').addEventListener('input', ev => {
  const t = ev.target;
  if (t.classList.contains('hv-in')) { const tag = t.dataset.tag; hv[tag] = { ...(hv[tag] || {}), v: t.value }; delete hvErros[tag]; hvConfAvisos = false; $('#hv-salvar').classList.remove('conf'); atualizarLinha(tag); }
});
$('#hv-tab').addEventListener('change', ev => {
  const t = ev.target;
  if (t.classList.contains('hv-t')) { const tag = t.dataset.tag, ms = fromLocal(t.value); hv[tag] = { ...(hv[tag] || {}), t: isFinite(ms) ? ms : null }; delete hvErros[tag]; atualizarLinha(tag); }
});
$('#hv-tab').addEventListener('keydown', ev => {
  const t = ev.target;
  if (!t.classList.contains('hv-in') || (ev.key !== 'Enter' && ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp')) return;
  ev.preventDefault();
  const ins = [...document.querySelectorAll('#hv-tab .hv-in')], i = ins.indexOf(t);
  const prox = ins[ev.key === 'ArrowUp' ? i - 1 : i + 1];
  if (prox) { prox.focus(); prox.select(); } else if (ev.key === 'Enter') $('#hv-salvar').focus();
});
$('#hv-tab').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-hv]'); if (!b) return;
  const a = b.dataset.hv, tag = b.dataset.tag;
  if (a !== 'rm') hvConfRm = null;
  if (a === 'tOutro') { hv[tag] = { ...(hv[tag] || {}), t: coletaTela() }; renderHor(); const el = document.querySelector(`#hv-tab .hv-t[data-tag="${CSS.escape(tag)}"]`); if (el) el.focus(); return; }
  if (a === 'tTopo') { hv[tag] = { ...(hv[tag] || {}), t: null }; renderHor(); return; }
  if (a === 'hist') { hvHist = hvHist === tag ? null : tag; renderHor(); return; }
  if (a === 'rm') {
    const id = b.dataset.id;
    if (hvConfRm !== id) { hvConfRm = id; renderHor(); return; }
    hvConfRm = null;
    try { await db.doc('leituras/' + id).delete(); hvAvisar('Leitura removida. O horímetro do equipamento voltou para a leitura anterior.'); }
    catch (er) { hvAvisar(er && er.status && er.status < 500 ? er.message : 'Não foi possível remover. Tente de novo.'); }
    renderHor();
  }
});
$('#hv-coleta').addEventListener('change', ev => { const ms = fromLocal(ev.target.value); if (isFinite(ms)) { hvColeta = ms; hvConfAvisos = false; renderHor(); } });
$('#hv-agora').addEventListener('click', () => { hvColeta = Math.floor(Date.now() / 60000) * 60000; hvConfAvisos = false; renderHor(); });
$('#hv-frota').addEventListener('change', ev => { hvFrota = ev.target.value; renderHor(); });
$('#hv-busca').addEventListener('input', ev => { hvBusca = ev.target.value; renderHor(); const s = $('#hv-busca'); s.focus(); });
$('#hv-salvar').addEventListener('click', salvarLeituras);
async function salvarLeituras() {
  if (hvSalvando || !pvPlan()) return;
  // Só as linhas com valor (todas as frotas, mesmo as escondidas pelo filtro).
  const linhas = Object.values(equip).filter(e => e.ativo !== false && daTela(e)).map(e => ({ e, r: conferirLinha(e) })).filter(x => x.r.v != null);
  if (!linhas.length) { hvAvisar('Digite pelo menos uma leitura.'); return; }
  const erros = linhas.filter(x => x.r.nivel === 'erro'), avisos = linhas.filter(x => x.r.nivel === 'aviso');
  if (erros.length) {
    hvAvisar(`Confira ${erros.length} ${erros.length > 1 ? 'linhas em vermelho' : 'linha em vermelho'}: ${erros.map(x => x.e.tag).join(', ')}.`);
    const el = document.querySelector(`#hv-tab .hv-in[data-tag="${CSS.escape(erros[0].e.tag)}"]`); if (el) el.focus();
    return;
  }
  if (avisos.length && !hvConfAvisos) {
    hvConfAvisos = true; renderHor();
    hvAvisar(`${avisos.length} ${avisos.length > 1 ? 'leituras subiram' : 'leitura subiu'} mais horas que o tempo passado desde a anterior (${avisos.map(x => x.e.tag).join(', ')}). Confira e clique em "Confirmar e salvar".`);
    return;
  }
  hvSalvando = true; hvConfAvisos = false; renderHor();
  let ok = 0; const falhas = [];
  const quem = (usuarioAtual() || {}).curto || '';
  for (const { e, r } of linhas) {
    const t = Math.round(r.t), id = `${e.tag}_${t}`;
    try { await db.doc('leituras/' + id).set({ tag: e.tag, valor: r.v, capturadaEm: t, origem: 'diaria', lancadaPor: quem }); delete hv[e.tag]; delete hvErros[e.tag]; ok++; }
    catch (er) { hvErros[e.tag] = er && er.status && er.status < 500 ? er.message : 'Não foi possível salvar. Tente de novo.'; falhas.push(e.tag); }
  }
  hvSalvando = false;
  hvMsg = '';
  renderHor();
  hvAvisar(falhas.length ? `${ok} ${ok === 1 ? 'leitura salva' : 'leituras salvas'}. ${falhas.length} com problema: ${falhas.join(', ')}.` : `${ok} ${ok === 1 ? 'leitura salva' : 'leituras salvas'}.`);
}

/* Colar do Excel: TAG e horímetro (e, se quiser, a data e hora da coleta), uma linha por equipamento. */
$('#hv-colar').addEventListener('click', () => {
  $('#hv-colar-m').hidden = false;
  $('#hv-colar-dlg').innerHTML = `<div class="d-h lh"><div><h2 id="hv-colar-t">Colar do Excel</h2><p>Copie as colunas da planilha e cole abaixo. Uma linha por equipamento: TAG e horímetro. Uma terceira coluna com a data e a hora da coleta é opcional (sem ela, vale o horário do topo).</p></div><button type="button" class="x" data-cl="fechar" aria-label="Fechar">×</button></div>
    <textarea id="hv-colar-txt" class="hv-txt" rows="10" placeholder="ADT-01&#9;12450&#10;ADT-02&#9;8.390&#10;EX-01&#9;15210&#9;02/10/2026 07:00" spellcheck="false"></textarea>
    <p class="qr-st" id="hv-colar-st" role="status"></p>
    <div class="acoes"><button type="button" class="go sec" style="--k:var(--muted)" data-cl="fechar">Cancelar</button><button type="button" class="go" style="--k:var(--s-pm)" data-cl="ok">Preencher as leituras</button></div>`;
  $('#hv-colar-txt').focus();
});
function dataColada(s) {
  s = String(s || '').trim(); if (!s) return null;
  let m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear(); return new Date(y, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)).getTime(); }
  m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0)).getTime();
  return NaN;
}
$('#hv-colar-dlg').addEventListener('click', ev => {
  const b = ev.target.closest('[data-cl]'); if (!b) return;
  if (b.dataset.cl === 'fechar') { $('#hv-colar-m').hidden = true; return; }
  const linhas = $('#hv-colar-txt').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  let n = 0; const nao = [], ruins = [];
  for (const l of linhas) {
    const p = l.split(/\t|;|\s{2,}/).map(x => x.trim()).filter(x => x !== '');
    if (p.length < 2) { const q = l.split(/\s+/); if (q.length >= 2) { p.length = 0; p.push(q[0], q[1], q.slice(2).join(' ')); } }
    const tag = String(p[0] || '').toUpperCase().replace(/\s+/g, '');
    if (/^tag$/i.test(tag)) continue;
    if (!equip[tag]) { nao.push(p[0] || l); continue; }
    const v = numBR(p[1]); if (v == null || !isFinite(v)) { ruins.push(tag); continue; }
    const t = p[2] ? dataColada(p[2]) : null;
    hv[tag] = { v: String(p[1]).trim(), t: t && isFinite(t) ? t : null }; delete hvErros[tag]; n++;
  }
  const st = $('#hv-colar-st');
  if (!n) { st.className = 'qr-st er'; st.textContent = 'Nenhuma linha reconhecida. Use TAG e horímetro, separados por tabulação ou ponto e vírgula.'; return; }
  $('#hv-colar-m').hidden = true; hvFrota = ''; hvBusca = ''; $('#hv-busca').value = '';
  renderHor();
  hvAvisar(`${n} ${n === 1 ? 'leitura preenchida' : 'leituras preenchidas'}. Confira e clique em Salvar.${nao.length ? ' Não encontrados: ' + nao.slice(0, 8).join(', ') + (nao.length > 8 ? '…' : '') + '.' : ''}${ruins.length ? ' Valor ilegível: ' + ruins.join(', ') + '.' : ''}`);
});
$('#hv-colar-m').addEventListener('click', e => { if (e.target.id === 'hv-colar-m') $('#hv-colar-m').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#hv-colar-m').hidden) $('#hv-colar-m').hidden = true; });

/* ---------- inglês ---------- */
if (typeof EN === 'object') {
  Object.assign(EN, {
    'Preventivas': 'Preventive', 'Horímetros': 'Hour meters', 'Seção de preventivas': 'Preventive section',
    'Preventiva próxima': 'Preventive due soon', 'Mandar para preventiva': 'Send to preventive', 'Preventiva': 'Preventive', 'Preventiva não agendada': 'Unscheduled preventive',
    'Vencida': 'Overdue', 'Próxima': 'Due soon', 'Em preventiva': 'In preventive', 'Sem agendamento': 'Not scheduled', 'Em dia': 'Up to date',
    'Vencidas': 'Overdue', 'Próximas': 'Due soon', 'Em preventiva agora': 'In preventive now', 'Avisar quando faltarem': 'Warn when remaining', 'Avisar quando faltarem (h)': 'Warn when remaining (h)',
    'Todos': 'All', 'Vencidas e próximas': 'Overdue and due soon', 'Buscar TAG, frota ou preventiva': 'Search tag, fleet or preventive', 'Resumo das preventivas': 'Preventive summary',
    'Equipamento': 'Unit', 'Horímetro atual': 'Current hour meter', 'Próxima preventiva': 'Next preventive', 'Faltam': 'Remaining', 'Previsão': 'Forecast', 'Depois': 'Later',
    'Agendar': 'Schedule', 'Agendar / editar': 'Schedule / edit', 'Ver': 'View', 'Agendadas': 'Scheduled', 'Feitas': 'Done', 'Marcar feita': 'Mark done', 'Remover preventiva': 'Remove preventive',
    'Nome (ex.: PM 500)': 'Name (e.g. PM 500)', 'Horímetro (h)': 'Hour meter (h)', 'Nome da preventiva': 'Preventive name', 'Horímetro da preventiva': 'Preventive hour meter',
    'Nome da nova preventiva': 'New preventive name', 'Horímetro da nova preventiva': 'New preventive hour meter',
    'Nenhuma preventiva agendada.': 'No preventive scheduled.', 'Nenhuma preventiva feita ainda.': 'No preventive done yet.', 'Nenhuma preventiva vencida ou próxima.': 'No overdue or upcoming preventive.',
    'Agende quantas quiser. O painel avisa a mais próxima.': 'Schedule as many as you like. The board warns about the nearest one.',
    'O horímetro sugerido repete o intervalo das duas últimas.': 'The suggested hour meter repeats the interval of the last two.',
    'Informe o horímetro em que a preventiva deve ser feita.': 'Enter the hour meter at which the preventive is due.', 'Essa preventiva já está agendada.': 'This preventive is already scheduled.',
    'Preventiva removida da agenda.': 'Preventive removed from the schedule.', 'Preventiva atualizada.': 'Preventive updated.', 'Horímetro inválido.': 'Invalid hour meter.',
    'Marcada pelo planejamento': 'Marked by planning', 'Parada': 'Stop', 'faltam': 'remaining', 'vencida': 'overdue', 'em andamento': 'in progress', 'sem média ainda': 'no average yet', 'sem leitura': 'no reading',
    'Agende as preventivas de cada equipamento pelo horímetro. A previsão usa o uso médio dos últimos 30 dias.': 'Schedule each unit\'s preventives by hour meter. The forecast uses the average usage of the last 30 days.',
    'Lançamento diário do horímetro de cada equipamento. O horímetro do quadro passa a ser a leitura com a coleta mais recente.': 'Daily hour meter entry for each unit. The board uses the reading with the most recent collection time.',
    'Parada preventiva': 'Preventive stop', 'Ao liberar o equipamento, a preventiva sai da lista de agendadas e fica registrada como feita.': 'When the unit is released, the preventive leaves the schedule and is recorded as done.',
    'O equipamento entra na fila da manutenção como': 'The unit enters the maintenance queue as a', 'parada preventiva': 'preventive stop', '. Quando a manutenção liberar, a preventiva fica registrada como feita.': '. When maintenance releases it, the preventive is recorded as done.',
    'Programada com a manutenção': 'Scheduled with maintenance', 'Voltar': 'Back', 'no horímetro': 'at hour meter', 'Tipo de parada': 'Stop type', 'Corretiva': 'Corrective',
    'Data e hora da coleta': 'Collection date and time', 'Agora': 'Now', 'Frota': 'Fleet', 'Todas as frotas': 'All fleets', 'Buscar': 'Search', 'TAG ou modelo': 'Tag or model',
    'Vale para todas as linhas. Se uma leitura foi feita em outro horário, use "outro horário" na linha dela.': 'Applies to every line. If a reading was taken at another time, use "other time" on its line.',
    'Colar do Excel': 'Paste from Excel', 'Salvar leituras': 'Save readings', 'Confirmar e salvar': 'Confirm and save', 'Última leitura': 'Last reading', 'Nova leitura (h)': 'New reading (h)', 'Horário da coleta': 'Collection time', 'Diferença': 'Difference',
    'Histórico': 'History', 'Fechar': 'Close', 'outro horário': 'other time', 'Sem leitura': 'No reading', 'Primeira leitura': 'First reading', 'Número inválido': 'Invalid number', 'Horário da coleta no futuro': 'Collection time in the future',
    'mais horas que o tempo passado': 'more hours than time elapsed', 'agora há pouco': 'just now', 'Já tem leitura nesta data': 'Already read on this date', 'Usar o horário do topo': 'Use the time at the top',
    'Nenhuma leitura registrada.': 'No readings yet.', 'Lançamento diário': 'Daily entry', 'Cadastro': 'Equipment', 'Correção': 'Correction', 'Leitura inicial': 'Initial reading', 'Remover leitura': 'Remove reading',
    'Digite pelo menos uma leitura.': 'Type at least one reading.', 'Leitura removida. O horímetro do equipamento voltou para a leitura anterior.': 'Reading removed. The unit hour meter went back to the previous reading.',
    'Preencher as leituras': 'Fill in the readings', 'Nenhuma linha reconhecida. Use TAG e horímetro, separados por tabulação ou ponto e vírgula.': 'No line recognized. Use tag and hour meter, separated by tab or semicolon.',
    'Copie as colunas da planilha e cole abaixo. Uma linha por equipamento: TAG e horímetro. Uma terceira coluna com a data e a hora da coleta é opcional (sem ela, vale o horário do topo).': 'Copy the spreadsheet columns and paste them below. One line per unit: tag and hour meter. A third column with the collection date and time is optional (without it, the time at the top applies).',
    'Entre com seu usuário para ver as preventivas e lançar os horímetros.': 'Sign in to see preventives and enter hour meters.',
    'As leituras de horímetro são lançadas pelo planejamento.': 'Hour meter readings are entered by planning.', 'Informe o horímetro.': 'Enter the hour meter.', 'Informe a data e a hora da coleta.': 'Enter the collection date and time.',
    'A data da coleta não pode estar no futuro.': 'The collection date cannot be in the future.', 'As preventivas são controladas pelo planejamento.': 'Preventives are managed by planning.', 'Equipamento não encontrado.': 'Unit not found.',
    'Informe o horímetro de cada preventiva agendada.': 'Enter the hour meter of each scheduled preventive.',
    'Leituras de horímetro': 'Hour meter readings', 'Preventivas feitas': 'Preventives done', 'Preventivas agendadas': 'Scheduled preventives', 'Peças': 'Parts'
  });
  PAT.push(
    [/^Preventiva · (.+)$/, 'Preventive · $1'],
    [/^Parada preventiva · (.+)$/, 'Preventive stop · $1'],
    [/^(.+) \(a próxima\)$/, '$1 (the next one)'],
    [/^faltam ([\d.,]+) h$/, '$1 h remaining'],
    [/^vencida há ([\d.,]+) h$/, 'overdue by $1 h'],
    [/^previsão (.+)$/, 'forecast $1'],
    [/^([\d,]+) h\/dia$/, '$1 h/day'],
    [/^média ([\d,]+) h\/dia$/, 'average $1 h/day'],
    [/^em ([\d.,]+ h)$/, 'at $1'],
    [/^Depois: (.+)$/, 'Later: $1'],
    [/^Agendadas · (.+)$/, 'Scheduled · $1'],
    [/^Confirmar: feita em (.+)$/, 'Confirm: done at $1'],
    [/^O painel avisa quando faltarem (\d+) h\.$/, 'The board warns when $1 h remain.'],
    [/^(.+) agendada para (.+) em (.+)\.$/, '$1 scheduled for $2 at $3.'],
    [/^(.+) de (.+) marcada como feita\.$/, '$1 of $2 marked as done.'],
    [/^Salvar (\d+) leituras?$/, 'Save $1 readings'],
    [/^(\d+) leituras? salvas?\.$/, '$1 readings saved.'],
    [/^de (\d+) com leitura em (.+)$/, 'of $1 with a reading on $2'],
    [/^há ([\d.,]+) (h|dias)$/, (m, n, u) => `${n} ${u === 'h' ? 'h' : 'days'} ago`],
    [/^coletada (.+)$/, 'collected $1'],
    [/^lançada (.+)$/, 'entered $1'],
    [/^\+([\d.,]+) h em ([\d.,]+) (h|dias)$/, (m, a, b, u) => `+${a} h in ${b} ${u === 'h' ? 'h' : 'days'}`],
    [/^Menor que a leitura de (.+) \((.+)\)$/, 'Lower than the reading of $1 ($2)'],
    [/^Maior que a leitura de (.+) \((.+)\)$/, 'Higher than the reading of $1 ($2)'],
    [/^Nova leitura de (.+)$/, 'New reading for $1'],
    [/^Horário da coleta de (.+)$/, 'Collection time for $1'],
    [/^Enviado para a preventiva \((.+)\)\. A manutenção já vê este equipamento na fila\.$/, 'Sent to preventive ($1). Maintenance already sees this unit in the queue.']
  );
  if (LANG === 'en' && typeof trTree === 'function') trTree(document.body);
}
