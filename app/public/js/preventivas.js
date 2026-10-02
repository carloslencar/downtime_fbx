/* ---------- Preventivas por horímetro ----------
   - Planos (config/planos): por frota, com os intervalos da revisão (ex.: 250, 500, 1000, 2000 h).
     Intervalos aninhados: no horímetro de 1000 h faz-se a revisão de 1000 (que já inclui a de 500 e a de 250).
     Com um intervalo só (ex.: 250), todas as revisões são iguais.
   - Leituras (coleção "leituras"): lançamento diário do horímetro pelo planejamento, com a data e a hora
     em que a leitura foi COLETADA. O servidor mantém o horímetro do equipamento e a média de horas por dia.
   - Registro (coleção "preventivas", id = TAG): histórico das preventivas feitas. A liberação de uma parada
     preventiva registra sozinha; o planejamento também registra (ex.: para informar a última feita).
   - Painel: o cartão avisa quando a preventiva está próxima ou vencida, e a operação manda o equipamento
     para a preventiva pelo botão "Mandar para preventiva" (vira uma parada do tipo preventiva). */
let planos = [], preventivas = {}, leituras = {}, leiturasOn = false, leiturasVer = 0, idxLeit = null, idxVer = -1;
let pvTab = 'lista';
try { pvTab = localStorage.getItem('qp-pvtab') || 'lista'; } catch (e) {}
let pvFiltro = 'atencao', pvBusca = '', pvForm = null, pvHist = null, pvConfRm = null, pvMsg = '';
let hvColeta = null, hv = {}, hvBusca = '', hvFrota = '', hvHist = null, hvConfAvisos = false, hvErros = {}, hvSalvando = false, hvMsg = '', hvConfRm = null;
let plEdit = null, plFd = null, plErr = '', plConfRm = false, plMsg = '';
const DIA_MS = 86400000;

window.dt.db.doc('config/planos').onSnapshot(s => {
  planos = s.exists && Array.isArray(s.data().lista) ? s.data().lista.filter(p => p && p.id) : [];
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

/* ---------- cálculo da próxima preventiva ---------- */
function pvPlan() { return papel === 'planejador' || papel === 'admin'; }
function numN(v) { const n = Number(v); return v === '' || v == null || !isFinite(n) ? null : n; }
function intervalosDe(p) { return [...new Set((p && p.intervalos || []).map(Number).filter(n => n > 0))].sort((a, b) => a - b); }
function planoDe(e) { return e ? planos.find(p => (p.frotas || []).includes(e.grupo)) || null : null; }
// Nome da revisão numa posição do ciclo: o maior intervalo que divide a posição (750 -> PM 250; 1000 -> PM 1000).
function nomePM(pos, p) { const iv = intervalosDe(p); if (!iv.length || !pos) return 'PM'; let n = iv[0]; for (const i of iv) if (pos % i === 0) n = i; return 'PM ' + n; }
function proxPos(pos, p) { const iv = intervalosDe(p), b = iv[0], c = iv[iv.length - 1]; return pos ? (pos % c) + b : b; }
function historicoPM(tag) { const r = preventivas[tag]; return r && Array.isArray(r.historico) ? r.historico : []; }
function ultimaPM(tag) { const h = historicoPM(tag); return h.length ? h[h.length - 1] : null; }
function sugestaoPM(e, p) {
  const iv = intervalosDe(p), b = iv[0], c = iv[iv.length - 1], h = numN(e.horimetro);
  if (h == null) return null;
  const hor = Math.floor(h / b) * b;
  return { horimetro: hor, pos: hor % c || c };
}
function estadoPM(e) {
  const p = planoDe(e); if (!p) return null;
  const iv = intervalosDe(p); if (!iv.length) return null;
  const reg = preventivas[e.tag] || {}, ult = ultimaPM(e.tag);
  const o = { plano: p, iv, ult, aviso: numN(p.aviso) ?? 50, programada: reg.programada || null, media: numN(e.horimetroMedia), hor: numN(e.horimetro) };
  if (e.preventiva && e.status !== 'operando') { o.st = 'em_pm'; o.pos = e.preventiva.pos; o.nome = e.preventiva.nome || nomePM(o.pos, p); return o; }
  if (!ult || numN(ult.horimetro) == null) { o.st = 'sem'; o.sug = sugestaoPM(e, p); return o; }
  o.pos = proxPos(numN(ult.pos), p); o.nome = nomePM(o.pos, p);
  o.alvo = numN(ult.horimetro) + iv[0];
  o.faltam = o.hor == null ? null : Math.round((o.alvo - o.hor) * 10) / 10;
  o.st = o.faltam == null ? 'ok' : o.faltam <= 0 ? 'vencida' : o.faltam <= o.aviso ? 'proxima' : 'ok';
  if (o.faltam != null && o.faltam > 0 && o.media > 0 && e.horimetroEm) o.previsao = e.horimetroEm + o.faltam / o.media * DIA_MS;
  return o;
}
// Preventiva sugerida quando a operação abre a parada com o motivo "Preventiva".
function pmPadrao(e) { const o = estadoPM(e); if (!o) return null; const pos = o.pos || o.iv[0]; return { pos, nome: o.nome || nomePM(pos, o.plano) }; }
const ST_PM = { vencida: 'Vencida', proxima: 'Próxima', em_pm: 'Em preventiva', sem: 'Sem registro', ok: 'Em dia' };
function fmtNum(n) { return Number(n).toLocaleString('pt-BR'); }
function diaMes(ms) { return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }
function dataCurta(ms) { return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function dataProg(s) { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ''); return m ? `${m[3]}/${m[2]}` : ''; }
function faltamTxt(o) { if (o.faltam == null) return '—'; return o.faltam <= 0 ? `vencida há ${fmtNum(Math.round(-o.faltam))} h` : `faltam ${fmtNum(Math.round(o.faltam))} h`; }

/* ---------- no painel ---------- */
function marcarPM(b, e) {
  const o = estadoPM(e);
  let pm = '';
  if (o && (o.st === 'vencida' || o.st === 'proxima' || o.st === 'em_pm')) pm = o.st;
  else if (o && o.programada && e.status === 'operando') pm = 'prog';
  b.dataset.pm = pm;
  let bd = b.querySelector('.eq-pm');
  if (pm && !bd) { bd = document.createElement('span'); bd.className = 'eq-pm'; b.querySelector('.eq-top').appendChild(bd); }
  if (bd) { bd.hidden = !pm; bd.textContent = 'PM'; }
  if (!pm || e.status !== 'operando') return;
  b.querySelector('.eq-rot').textContent = o.nome || 'PM';
  b.querySelector('.eq-tm').textContent = o.st === 'vencida' ? 'vencida' : o.st === 'proxima' ? fmtNum(Math.round(o.faltam)) + ' h' : 'prog. ' + dataProg(o.programada);
  b.title = `${e.tag} · Operando · ${o.nome} ${o.st === 'vencida' ? 'vencida' : o.st === 'proxima' ? faltamTxt(o) : 'programada para ' + dataProg(o.programada)}`;
  b.setAttribute('aria-label', b.title);
}
function pmModalHtml(e) {
  const o = estadoPM(e); if (!o) return '';
  if (o.st === 'em_pm') {
    return `<div class="pm-box" data-st="em_pm"><span class="lb">Parada preventiva · ${esc(o.nome)}</span><p>Ao liberar o equipamento, a preventiva fica registrada no horímetro da parada e o contador recomeça.</p></div>`;
  }
  let corpo;
  if (o.st === 'sem') corpo = `<p>Plano <b>${esc(o.plano.nome)}</b>. O planejamento ainda não informou a última preventiva deste equipamento.</p>`;
  else corpo = `<p><b>${esc(o.nome)}</b> no horímetro <b>${fmtH(o.alvo)}</b> · ${esc(faltamTxt(o))}${o.previsao ? ` · previsão ${esc(diaMes(o.previsao))}` : ''}</p><p class="pm-det">Última: ${esc(o.ult.nome || 'PM')} em ${fmtH(o.ult.horimetro)} (${esc(dataCurta(o.ult.em))})${o.media != null ? ` · uso médio ${String(o.media).replace('.', ',')} h/dia` : ''}${o.programada ? ` · programada para ${esc(dataProg(o.programada))}` : ''}</p>`;
  const bt = papel === 'operacao' && e.status === 'operando' ? `<div class="acoes"><button type="button" class="go${o.st === 'vencida' || o.st === 'proxima' || o.programada ? '' : ' sec'}" style="--k:var(--s-pm)" data-acao="modoPM">Mandar para preventiva</button></div>` : '';
  return `<div class="pm-box" data-st="${o.st}"><span class="lb">Preventiva · ${esc(ST_PM[o.st])}</span>${corpo}${bt}</div>`;
}
function formPMHtml(e) {
  const o = estadoPM(e); if (!o) return '';
  const prox = o.pos ? { pos: o.pos, nome: o.nome } : { pos: o.iv[0], nome: nomePM(o.iv[0], o.plano) };
  const opts = [{ ...prox, rot: prox.nome + ' (a próxima)' }, ...o.iv.map(i => ({ pos: i, nome: 'PM ' + i, rot: 'PM ' + i })).filter(x => x.nome !== prox.nome)];
  return `<div class="corr pm-form"><h4>Mandar para preventiva</h4>
    <p class="nota" style="border-style:solid">O equipamento entra na fila da manutenção como <b>parada preventiva</b>. Quando a manutenção liberar, a preventiva fica registrada.</p>
    <div class="fs"><label for="pm-tipo">Preventiva</label><select id="pm-tipo">${opts.map(x => `<option value="${x.pos}" data-nome="${esc(x.nome)}">${esc(x.rot)}</option>`).join('')}</select></div>
    <div class="fs"><label for="obs">Observação</label><input type="text" id="obs" maxlength="80" placeholder="Programada com a manutenção"></div>
    ${horCampo(e)}${aberto.err ? `<p class="erro">${esc(aberto.err)}</p>` : ''}
    <div class="acoes"><button type="button" class="go sec" style="--k:var(--muted)" data-acao="voltar">Voltar</button><button type="button" class="go" style="--k:var(--s-pm)" data-acao="confPM">Mandar para preventiva</button></div></div>`;
}
async function cliquePMModal(a, t, e) {
  if (a === 'modoPM') { aberto.modo = 'pm'; aberto.err = ''; aberto.msg = null; renderModal(); const s = $('#pm-tipo'); if (s) s.focus(); return true; }
  if (a !== 'confPM') return false;
  const sel = $('#pm-tipo'), op = sel.selectedOptions[0], pos = Number(sel.value), nome = op.dataset.nome;
  const obs = ($('#obs').value || '').trim();
  const h = lerHor(e, t); if (!h.ok) return true;
  const d = { obs }; if (h.val != null) d.hor = h.val;
  t.disabled = true;
  const ok = await aplicar('abrir', e.tag, { status: 'aguardando', motivo: 'Preventiva', obs: nome + (obs ? ' · ' + obs : ''), tecnico: '', inicioParada: Date.now(), preventiva: { pos, nome }, ...horPatch(d) },
    { por: 'Operação' + nomeSessao(), detalhe: 'Preventiva · ' + nome + (obs ? ' · ' + obs : '') + horTxt(d), hor: d.hor ?? null });
  if (ok === false) { t.disabled = false; return true; }
  aberto.modo = null; aberto.err = ''; aberto.st = null;
  aberto.msg = { txt: `Enviado para a preventiva (${nome}). A manutenção já vê este equipamento na fila.`, c: 'aguardando' };
  renderModal(); const m = $('#dlg .okmsg'); if (m) m.focus();
  return true;
}

/* ---------- página: abas ---------- */
function renderPrev() {
  if ($('#v-prev').hidden) return;
  const plan = pvPlan();
  if (!plan && pvTab !== 'lista') pvTab = 'lista';
  document.querySelectorAll('#pv-tabs button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.pt === pvTab)); b.hidden = b.dataset.pt !== 'lista' && !plan; });
  $('#pv-tabs').hidden = !plan;
  $('#pv-lista-v').hidden = pvTab !== 'lista'; $('#pv-hor-v').hidden = pvTab !== 'hor'; $('#pv-planos-v').hidden = pvTab !== 'planos';
  $('#pv-sub').textContent = pvTab === 'hor' ? 'Lançamento diário do horímetro de cada equipamento. O horímetro do quadro passa a ser a leitura com a coleta mais recente.'
    : pvTab === 'planos' ? 'Cada frota segue um plano. Os intervalos definem as revisões do ciclo.'
    : 'Próximas preventivas pelo horímetro. A previsão usa o uso médio dos últimos 30 dias.';
  if (pvTab === 'lista') renderPvLista();
  else if (pvTab === 'hor') { ligarLeituras(); renderHor(); }
  else renderPlanos();
}
$('#pv-tabs').addEventListener('click', ev => {
  const b = ev.target.closest('[data-pt]'); if (!b) return;
  pvTab = b.dataset.pt; try { localStorage.setItem('qp-pvtab', pvTab); } catch (e) {}
  renderPrev();
});

/* ---------- aba Preventivas ---------- */
const RANK_PM = { vencida: 0, em_pm: 1, proxima: 2, sem: 3, ok: 4 };
function linhasPv() {
  return Object.values(equip).filter(e => e.ativo !== false && daTela(e)).map(e => ({ e, o: estadoPM(e) }));
}
function pvAvisar(t) { pvMsg = t; clearTimeout(pvAvisar.t); pvAvisar.t = setTimeout(() => { pvMsg = ''; if (pvTab === 'lista') renderPvLista(); }, 6000); renderPvLista(); }
function renderPvLista() {
  const todas = linhasPv(), com = todas.filter(x => x.o), semPlano = todas.length - com.length;
  const c = { vencida: 0, proxima: 0, em_pm: 0, sem: 0, ok: 0 }; let prog = 0;
  for (const x of com) { c[x.o.st]++; if (x.o.programada && x.o.st !== 'em_pm') prog++; }
  $('#pv-resumo').innerHTML = [['Vencidas', c.vencida, 'vencida'], ['Próximas', c.proxima, 'proxima'], ['Programadas', prog, ''], ['Em preventiva agora', c.em_pm, ''], ['Sem registro da última', c.sem, ''], ['Sem plano', semPlano, '']]
    .map(([l, v, k]) => `<div class="k"${k ? ` data-pmk="${k}"` : ''}><div class="k-l">${esc(l)}</div><div class="k-v${v ? '' : ' zero'}">${esc(v)}</div></div>`).join('');
  document.querySelectorAll('#pv-filtro button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === pvFiltro)));
  const plan = pvPlan();
  const sg = $('#pv-sugerir'); sg.hidden = !plan || !c.sem; sg.textContent = `Usar a sugestão nos ${c.sem} sem registro`;
  $('#pv-msg').textContent = pvMsg; $('#pv-msg').hidden = !pvMsg;
  if (!planos.length) {
    $('#pv-tab').innerHTML = `<div class="pv-vazio"><h3>Nenhum plano de preventiva ainda</h3><p>Crie um plano para cada frota, com os intervalos da revisão (ex.: 250, 500, 1000 e 2000 h). Depois informe a última preventiva de cada equipamento.</p>${plan ? '<button type="button" class="novo" data-pv="irPlanos">Criar o primeiro plano</button>' : '<p class="dica">Os planos são cadastrados pelo planejamento.</p>'}</div>`;
    return;
  }
  const q = pvBusca.trim().toLowerCase();
  const l = com.filter(x => (pvFiltro === 'todas' || x.o.st !== 'ok' || x.o.programada) &&
    (!q || [x.e.tag, x.e.modelo, x.o.plano.nome, (frotaDe(x.e.grupo) || {}).nome].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (RANK_PM[a.o.st] - RANK_PM[b.o.st]) || ((a.o.faltam ?? 1e9) - (b.o.faltam ?? 1e9)) || cmpTag(a.e.tag, b.e.tag));
  const guarda = {}; document.querySelectorAll('#pv-tab [data-keep]').forEach(el => { guarda[el.dataset.keep] = el.value; });
  const linhas = l.map(({ e, o }) => {
    const ult = o.ult, fr = frotaDe(e.grupo);
    const ultTxt = ult && numN(ult.horimetro) != null ? `<b>${esc(ult.nome || 'PM')}</b> · ${fmtH(ult.horimetro)}<small>${esc(dataCurta(ult.em))}${ult.numero ? ' · Parada nº ' + esc(ult.numero) : ult.origem === 'parada' ? '' : ' · registro do planejamento'}</small>` : '<span class="nulo">—</span>';
    const prox = o.st === 'em_pm' ? `<b>${esc(o.nome)}</b><small>em andamento</small>` : o.st === 'sem' ? (o.sug ? `<span class="nulo">sugestão: última ${esc(nomePM(o.sug.pos, o.plano))} em ${fmtH(o.sug.horimetro)}</span>` : '<span class="nulo">sem horímetro</span>') : `<b>${esc(o.nome)}</b> em ${fmtH(o.alvo)}<small>agora ${o.hor == null ? '—' : fmtH(o.hor)}</small>`;
    const falt = o.st === 'em_pm' || o.st === 'sem' || o.faltam == null ? '<span class="nulo">—</span>' : `<span class="pv-f${o.faltam <= 0 ? ' neg' : ''}">${o.faltam <= 0 ? '+' + fmtNum(Math.round(-o.faltam)) : fmtNum(Math.round(o.faltam))} h</span><small>${o.faltam <= 0 ? 'vencida' : 'faltam'}</small>`;
    const prev = o.previsao ? `${esc(diaMes(o.previsao))}<small>${String(o.media).replace('.', ',')} h/dia</small>` : `<span class="nulo">—</span>${o.st === 'ok' || o.st === 'proxima' ? `<small>${o.media == null ? 'sem média ainda' : ''}</small>` : ''}`;
    const progC = plan && o.st !== 'em_pm' ? `<input type="date" class="pv-prog" data-tag="${esc(e.tag)}" value="${esc(o.programada || '')}" aria-label="Programada para">` : (o.programada ? esc(dataProg(o.programada)) : '<span class="nulo">—</span>');
    const acoes = plan ? `<button type="button" class="ghost-sm" data-pv="${o.st === 'sem' ? 'informar' : 'registrar'}" data-tag="${esc(e.tag)}">${o.st === 'sem' ? 'Informar a última' : 'Registrar feita'}</button>` : '';
    const histN = historicoPM(e.tag).length;
    let extra = '';
    if (pvForm && pvForm.tag === e.tag) extra = `<tr class="pv-sub"><td colspan="8">${formRegistroHtml(e, o)}</td></tr>`;
    else if (pvHist === e.tag) extra = `<tr class="pv-sub"><td colspan="8">${histPvHtml(e, o, plan)}</td></tr>`;
    return `<tr data-st="${o.st}"><td><div class="pv-eq">${icone(e.tipo)}<span><b>${esc(e.tag)}</b><span class="pv-chip" data-st="${o.st}">${esc(ST_PM[o.st])}</span><small>${esc(fr ? fr.nome : '')}</small></span></div></td>
      <td>${esc(o.plano.nome)}<small>${esc(o.iv.join(' · '))} h</small></td><td>${ultTxt}</td><td>${prox}</td><td class="n">${falt}</td><td>${prev}</td><td class="pv-pc">${progC}</td>
      <td class="pv-ac">${acoes}${histN ? `<button type="button" class="lnk" data-pv="hist" data-tag="${esc(e.tag)}">${pvHist === e.tag ? 'Fechar histórico' : 'Histórico (' + histN + ')'}</button>` : ''}</td></tr>${extra}`;
  }).join('');
  $('#pv-tab').innerHTML = (l.length ? `<div class="p-tab pvt"><table><thead><tr><th>Equipamento</th><th>Plano</th><th>Última preventiva</th><th>Próxima revisão</th><th class="n">Faltam</th><th>Previsão</th><th>Programada</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
    : `<p class="vazio p-vazio">${pvFiltro === 'atencao' && !q ? 'Nenhuma preventiva vencida, próxima ou programada.' : 'Nenhum equipamento encontrado.'}</p>`)
    + (semPlano ? `<p class="dica pv-semplano">${semPlano} ${semPlano > 1 ? 'equipamentos sem plano' : 'equipamento sem plano'}: ${esc(todas.filter(x => !x.o).map(x => x.e.tag).sort(cmpTag).slice(0, 12).join(', '))}${semPlano > 12 ? '…' : ''}${plan ? ' · <button type="button" class="lnk" data-pv="irPlanos">Ligar as frotas a um plano</button>' : ''}</p>` : '');
  document.querySelectorAll('#pv-tab [data-keep]').forEach(el => { if (guarda[el.dataset.keep] != null) el.value = guarda[el.dataset.keep]; });
}
function formRegistroHtml(e, o) {
  const f = pvForm;
  const opts = o.iv.map(i => `<option value="${i}"${Number(f.pos) === i ? ' selected' : ''}>PM ${i}</option>`).join('');
  return `<div class="pv-reg"><h4>${f.modo === 'informar' ? 'Última preventiva feita' : 'Registrar preventiva feita'} · ${esc(e.tag)}</h4>
    ${f.modo === 'informar' ? `<p class="dica">${o.sug ? `Sugestão pelo horímetro atual (${fmtH(o.hor)}): a última foi a ${esc(nomePM(o.sug.pos, o.plano))} em ${fmtH(o.sug.horimetro)}. Ajuste se souber o valor real.` : 'Informe a última preventiva feita neste equipamento.'}</p>` : ''}
    <div class="pv-reg-g"><div class="cp"><label for="pr-pos">Preventiva</label><select id="pr-pos" data-keep="pr-pos">${opts}</select></div>
    <div class="cp"><label for="pr-hor">Horímetro (h)</label><input type="text" inputmode="decimal" id="pr-hor" data-keep="pr-hor" value="${esc(f.hor)}"></div>
    <div class="cp"><label for="pr-em">Data</label><input type="datetime-local" id="pr-em" data-keep="pr-em" step="60" value="${esc(f.em)}"></div></div>
    ${f.err ? `<p class="erro">${esc(f.err)}</p>` : ''}
    <div class="pv-reg-b"><button type="button" class="salvar" data-pv="salvarReg" data-tag="${esc(e.tag)}">Salvar</button><button type="button" class="ghost" data-pv="cancelarReg">Cancelar</button></div></div>`;
}
function histPvHtml(e, o, plan) {
  const h = historicoPM(e.tag).slice().reverse();
  return `<div class="pv-hist"><h4>Preventivas de ${esc(e.tag)}</h4>${h.map((x, k) => `<div class="pv-hl"><b>${esc(x.nome || 'PM')}</b><span>${x.horimetro != null ? fmtH(x.horimetro) : '—'}</span><span>${esc(dataCurta(x.em))}</span><small>${x.origem === 'parada' ? 'Parada' + (x.numero ? ' nº ' + esc(x.numero) : '') + (x.por ? ' · ' + esc(x.por) : '') : 'Registro do planejamento' + (x.por ? ' · ' + esc(x.por) : '')}</small>${plan ? `<button type="button" class="p-rm${pvConfRm === e.tag + '|' + x.em ? ' conf' : ''}" data-pv="rmReg" data-tag="${esc(e.tag)}" data-em="${esc(x.em)}" aria-label="Remover registro">${pvConfRm === e.tag + '|' + x.em ? 'Confirmar' : '×'}</button>` : ''}</div>`).join('')}</div>`;
}
async function gravarPrev(tag, patch) {
  const atual = preventivas[tag] || { tag, historico: [], programada: null };
  const doc = { ...atual, ...patch, tag, atualizadoEm: Date.now(), atualizadoPor: (usuarioAtual() || {}).curto || '' };
  await db.doc('preventivas/' + tag).set(doc);
}
function abrirReg(tag, modo) {
  const e = equip[tag], o = estadoPM(e); if (!o) return;
  pvHist = null;
  const s = modo === 'informar' && o.sug ? o.sug : { pos: o.pos || o.iv[0], horimetro: o.hor ?? '' };
  const tipo = Number(String(nomePM(s.pos, o.plano)).replace(/\D/g, '')) || o.iv[0];
  pvForm = { tag, modo, pos: tipo, posCiclo: s.pos, hor: s.horimetro === '' ? '' : String(s.horimetro), em: toLocal(Date.now()), err: '' };
  renderPvLista();
  const f = $('#pr-hor'); if (f) f.focus();
}
$('#pv-tab').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-pv]'); if (!b) return;
  const a = b.dataset.pv, tag = b.dataset.tag;
  if (a !== 'rmReg') pvConfRm = null;
  if (a === 'irPlanos') { pvTab = 'planos'; renderPrev(); return; }
  if (a === 'registrar' || a === 'informar') { abrirReg(tag, a); return; }
  if (a === 'cancelarReg') { pvForm = null; renderPvLista(); return; }
  if (a === 'hist') { pvForm = null; pvHist = pvHist === tag ? null : tag; renderPvLista(); return; }
  if (a === 'salvarReg') {
    const e = equip[tag], o = estadoPM(e); if (!o || !pvForm) return;
    const sel = Number($('#pr-pos').value), hor = numBR($('#pr-hor').value), em = fromLocal($('#pr-em').value);
    // Mantém a posição no ciclo quando o tipo escolhido é o esperado (ex.: a 750 h é uma PM 250, e a próxima é a de 1000).
    const pos = pvForm.posCiclo && nomePM(pvForm.posCiclo, o.plano) === 'PM ' + sel ? pvForm.posCiclo : sel;
    pvForm.pos = sel; pvForm.hor = $('#pr-hor').value; pvForm.em = $('#pr-em').value;
    if (hor == null || !isFinite(hor) || hor < 0) { pvForm.err = 'Informe o horímetro em que a preventiva foi feita.'; renderPvLista(); return; }
    if (!isFinite(em) || em > Date.now() + 600000) { pvForm.err = 'Confira a data (não pode estar no futuro).'; renderPvLista(); return; }
    if (o.hor != null && hor > o.hor + 0.5) { pvForm.err = `O horímetro é maior que o atual do equipamento (${fmtH(o.hor)}). Lance a leitura nova antes, na aba Horímetros.`; renderPvLista(); return; }
    const hist = [...historicoPM(tag), { pos, nome: nomePM(pos, o.plano), horimetro: hor, em, origem: 'manual', por: (usuarioAtual() || {}).curto || '' }].sort((x, y) => (x.em || 0) - (y.em || 0));
    b.disabled = true;
    try { await gravarPrev(tag, { historico: hist, programada: pvForm.modo === 'registrar' ? null : (preventivas[tag] || {}).programada || null }); }
    catch (er) { b.disabled = false; pvForm.err = er && er.status && er.status < 500 ? er.message : 'Não foi possível salvar. Tente de novo.'; renderPvLista(); return; }
    pvForm = null; pvAvisar(`${nomePM(pos, o.plano)} de ${tag} registrada em ${fmtH(hor)}.`);
    return;
  }
  if (a === 'rmReg') {
    const em = Number(b.dataset.em), k = tag + '|' + em;
    if (pvConfRm !== k) { pvConfRm = k; renderPvLista(); return; }
    pvConfRm = null;
    try { await gravarPrev(tag, { historico: historicoPM(tag).filter(x => Number(x.em) !== em) }); pvAvisar('Registro removido.'); }
    catch (er) { pvAvisar(er && er.status && er.status < 500 ? er.message : 'Não foi possível salvar. Tente de novo.'); }
  }
});
$('#pv-tab').addEventListener('change', async ev => {
  const t = ev.target; if (!t.classList.contains('pv-prog')) return;
  const tag = t.dataset.tag, v = t.value || null;
  try { await gravarPrev(tag, { programada: v }); pvAvisar(v ? `${tag}: preventiva programada para ${dataProg(v)}.` : `${tag}: programação removida.`); }
  catch (er) { pvAvisar(er && er.status && er.status < 500 ? er.message : 'Não foi possível salvar. Tente de novo.'); }
});
$('#pv-tab').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.closest('.pv-reg')) { const b = $('#pv-tab [data-pv="salvarReg"]'); if (b) b.click(); } });
$('#pv-filtro').addEventListener('click', ev => { const b = ev.target.closest('[data-f]'); if (!b) return; pvFiltro = b.dataset.f; renderPvLista(); });
$('#pv-busca').addEventListener('input', ev => { pvBusca = ev.target.value; renderPvLista(); });
$('#pv-sugerir').addEventListener('click', async ev => {
  const b = ev.currentTarget;
  if (b.dataset.conf !== '1') { b.dataset.conf = '1'; b.textContent = 'Confirmar: usar a sugestão (última PM no múltiplo do intervalo abaixo do horímetro atual)'; return; }
  delete b.dataset.conf; b.disabled = true;
  let n = 0;
  try {
    for (const { e, o } of linhasPv()) {
      if (!o || o.st !== 'sem' || !o.sug) continue;
      await gravarPrev(e.tag, { historico: [{ pos: o.sug.pos, nome: nomePM(o.sug.pos, o.plano), horimetro: o.sug.horimetro, em: Date.now(), origem: 'manual', sugestao: true, por: (usuarioAtual() || {}).curto || '' }] });
      n++;
    }
    pvAvisar(`${n} ${n === 1 ? 'equipamento atualizado' : 'equipamentos atualizados'} com a sugestão. Ajuste os que tiverem valor diferente em "Registrar feita".`);
  } catch (er) { pvAvisar(er && er.status && er.status < 500 ? er.message : 'Não foi possível salvar. Tente de novo.'); }
  b.disabled = false;
});

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

/* ---------- aba Planos ---------- */
function cicloTxt(iv) {
  if (!iv.length) return '';
  const b = iv[0], c = iv[iv.length - 1], p = { intervalos: iv }, seq = [];
  for (let pos = b; pos <= c && seq.length < 16; pos += b) seq.push(nomePM(pos, p));
  return seq.join(' → ') + (c / b > 16 ? ' → …' : '');
}
function lerIntervalos(s) { return [...new Set(String(s || '').split(/[^\d]+/).filter(Boolean).map(Number).filter(n => n > 0))].sort((a, b) => a - b); }
function novoPlano() { plEdit = null; plErr = ''; plConfRm = false; plFd = { nome: '', intervalos: '250, 500, 1000, 2000', aviso: '50', frotas: [] }; }
function editarPlano(id) { const p = planos.find(x => x.id === id); if (!p) return; plEdit = id; plErr = ''; plConfRm = false; plFd = { nome: p.nome, intervalos: intervalosDe(p).join(', '), aviso: String(p.aviso ?? 50), frotas: [...(p.frotas || [])] }; renderPlanos(); }
function renderPlanos() {
  if (!plFd) novoPlano();
  $('#pl-n').textContent = `${planos.length} ${planos.length === 1 ? 'plano' : 'planos'}`;
  $('#pl-lista').innerHTML = planos.length ? planos.map(p => {
    const fs = (p.frotas || []).map(id => (frotaDe(id) || { nome: id }).nome), n = Object.values(equip).filter(e => (p.frotas || []).includes(e.grupo)).length;
    return `<button type="button" class="pl-card" data-pl="${esc(p.id)}" aria-current="${plEdit === p.id}"><b>${esc(p.nome)}</b><span class="pl-iv">${esc(intervalosDe(p).join(' · '))} h · aviso ${esc(p.aviso ?? 50)} h antes</span><small>${fs.length ? esc(fs.join(', ')) : 'Nenhuma frota'} · ${n} ${n === 1 ? 'equipamento' : 'equipamentos'}</small></button>`;
  }).join('') : '<p class="vazio">Nenhum plano cadastrado. Crie o primeiro ao lado.</p>';
  const iv = lerIntervalos(plFd.intervalos), dono = {};
  for (const p of planos) if (p.id !== plEdit) for (const f of p.frotas || []) dono[f] = p.nome;
  $('#pl-form').innerHTML = `<h3>${plEdit ? 'Editar plano' : 'Novo plano'}</h3>
    <p class="sub">O plano vale para as frotas marcadas. A primeira revisão vem no menor intervalo depois da última feita.</p>
    <div class="cp"><label for="pl-nome">Nome do plano</label><input type="text" id="pl-nome" maxlength="40" value="${esc(plFd.nome)}" placeholder="Caminhões articulados"></div>
    <div class="g2"><div class="cp"><label for="pl-iv">Intervalos (h)</label><input type="text" id="pl-iv" maxlength="60" value="${esc(plFd.intervalos)}" placeholder="250, 500, 1000, 2000"><span class="dica">Separe por vírgula. Com um só intervalo (ex.: 250), todas as revisões são iguais.</span></div>
    <div class="cp"><label for="pl-av">Avisar quando faltarem (h)</label><input type="number" id="pl-av" min="0" max="2000" step="5" inputmode="numeric" value="${esc(plFd.aviso)}"><span class="dica">O cartão do painel muda a partir daí.</span></div></div>
    <div class="pl-ciclo" id="pl-ciclo">${iv.length ? `<span class="lb">Ciclo</span><p>${esc(cicloTxt(iv))}${iv.length > 1 ? ' · depois recomeça' : ''}</p>${iv.length > 1 ? `<p class="dica">Na de ${fmtNum(iv[iv.length - 1])} h faz-se a revisão completa, que já inclui as menores.</p>` : ''}` : ''}</div>
    <div class="cp"><span class="lb">Frotas</span><div class="pl-frotas">${frotas.map(f => `<label class="pl-fr"><input type="checkbox" value="${esc(f.id)}"${plFd.frotas.includes(f.id) ? ' checked' : ''}><span>${esc(f.nome)}${dono[f.id] ? `<small>hoje no plano ${esc(dono[f.id])}</small>` : ''}</span></label>`).join('')}</div></div>
    ${plErr ? `<p class="erro">${esc(plErr)}</p>` : ''}${plMsg ? `<p class="cfg-st ok">${esc(plMsg)}</p>` : ''}
    <div class="fbar"><button type="button" class="salvar" id="pl-salvar">${plEdit ? 'Salvar plano' : 'Criar plano'}</button><button type="button" class="ghost" id="pl-limpar">${plEdit ? 'Fechar' : 'Limpar'}</button><span class="sp"></span>${plEdit ? `<button type="button" class="rm${plConfRm ? ' conf' : ''}" id="pl-rm">${plConfRm ? 'Confirmar remoção' : 'Remover'}</button>` : ''}</div>`;
}
function lerPlForm() {
  plFd.nome = $('#pl-nome').value; plFd.intervalos = $('#pl-iv').value; plFd.aviso = $('#pl-av').value;
  plFd.frotas = [...document.querySelectorAll('#pl-form .pl-fr input:checked')].map(i => i.value);
}
$('#pl-form').addEventListener('input', ev => {
  if (ev.target.id === 'pl-iv') { const iv = lerIntervalos(ev.target.value); $('#pl-ciclo').innerHTML = iv.length ? `<span class="lb">Ciclo</span><p>${esc(cicloTxt(iv))}${iv.length > 1 ? ' · depois recomeça' : ''}</p>` : ''; }
});
$('#pl-form').addEventListener('click', async ev => {
  const b = ev.target.closest('button'); if (!b) return;
  if (b.id === 'pl-limpar') { novoPlano(); plMsg = ''; renderPlanos(); return; }
  if (b.id === 'pl-rm') {
    if (!plConfRm) { plConfRm = true; renderPlanos(); return; }
    try { await db.doc('config/planos').set({ lista: planos.filter(p => p.id !== plEdit) }); novoPlano(); plMsg = 'Plano removido.'; }
    catch (er) { plErr = er && er.status && er.status < 500 ? er.message : 'Não foi possível salvar. Tente de novo.'; }
    renderPlanos(); return;
  }
  if (b.id !== 'pl-salvar') return;
  lerPlForm(); plErr = ''; plMsg = '';
  const iv = lerIntervalos(plFd.intervalos), aviso = Math.max(0, Math.round(Number(plFd.aviso) || 0)), nome = plFd.nome.trim();
  if (!nome) plErr = 'Dê um nome ao plano.';
  else if (planos.some(p => p.id !== plEdit && p.nome.toLowerCase() === nome.toLowerCase())) plErr = 'Já existe um plano com esse nome.';
  else if (!iv.length) plErr = 'Informe pelo menos um intervalo, em horas.';
  else if (iv.some(n => n % iv[0] !== 0)) plErr = `Os intervalos precisam ser múltiplos do primeiro (${iv[0]} h). Ex.: 250, 500, 1000, 2000.`;
  if (plErr) { renderPlanos(); return; }
  const id = plEdit || 'pl' + Date.now().toString(36);
  const lista = planos.map(p => p.id === id ? null : { ...p, frotas: (p.frotas || []).filter(f => !plFd.frotas.includes(f)) }).filter(Boolean);
  lista.push({ id, nome, intervalos: iv, aviso, frotas: plFd.frotas });
  b.disabled = true;
  try { await db.doc('config/planos').set({ lista }); planos = lista; plEdit = id; plMsg = 'Plano salvo. Ele já vale para o painel.'; }
  catch (er) { plErr = er && er.status && er.status < 500 ? er.message : 'Não foi possível salvar. Tente de novo.'; }
  renderPlanos();
});
$('#pl-lista').addEventListener('click', ev => { const b = ev.target.closest('[data-pl]'); if (b) { plMsg = ''; editarPlano(b.dataset.pl); } });
$('#pl-novo').addEventListener('click', () => { novoPlano(); plMsg = ''; renderPlanos(); $('#pl-nome').focus(); });

/* ---------- inglês ---------- */
if (typeof EN === 'object') {
  Object.assign(EN, {
    'Preventivas': 'Preventive', 'Horímetros': 'Hour meters', 'Planos': 'Plans', 'Seção de preventivas': 'Preventive section',
    'Preventiva próxima': 'Preventive due soon', 'Mandar para preventiva': 'Send to preventive', 'Preventiva': 'Preventive',
    'Vencida': 'Overdue', 'Próxima': 'Due soon', 'Em preventiva': 'In preventive', 'Sem registro': 'No record', 'Em dia': 'Up to date',
    'Vencidas': 'Overdue', 'Próximas': 'Due soon', 'Programadas': 'Scheduled', 'Em preventiva agora': 'In preventive now', 'Sem registro da última': 'Last one not recorded', 'Sem plano': 'No plan',
    'Precisam de atenção': 'Need attention', 'Todas': 'All', 'Buscar TAG, frota ou plano': 'Search tag, fleet or plan', 'Resumo das preventivas': 'Preventive summary',
    'Equipamento': 'Unit', 'Plano': 'Plan', 'Última preventiva': 'Last preventive', 'Próxima revisão': 'Next service', 'Faltam': 'Remaining', 'Previsão': 'Forecast', 'Programada': 'Scheduled',
    'Registrar feita': 'Record as done', 'Informar a última': 'Enter the last one', 'faltam': 'remaining', 'vencida': 'overdue', 'em andamento': 'in progress', 'sem média ainda': 'no average yet', 'sem horímetro': 'no hour meter',
    'registro do planejamento': 'planning record', 'Registro do planejamento': 'Planning record', 'Parada': 'Stop', 'Salvar': 'Save', 'Cancelar': 'Cancel', 'Data': 'Date', 'Horímetro (h)': 'Hour meter (h)',
    'Última preventiva feita': 'Last preventive done', 'Registrar preventiva feita': 'Record preventive done', 'Programada para': 'Scheduled for', 'Remover registro': 'Remove record',
    'Nenhum plano de preventiva ainda': 'No preventive plan yet', 'Criar o primeiro plano': 'Create the first plan', 'Os planos são cadastrados pelo planejamento.': 'Plans are managed by planning.',
    'Crie um plano para cada frota, com os intervalos da revisão (ex.: 250, 500, 1000 e 2000 h). Depois informe a última preventiva de cada equipamento.': 'Create a plan for each fleet with the service intervals (e.g. 250, 500, 1000 and 2000 h). Then enter the last preventive of each unit.',
    'Nenhuma preventiva vencida, próxima ou programada.': 'No overdue, upcoming or scheduled preventive.', 'Ligar as frotas a um plano': 'Link the fleets to a plan', 'Registro removido.': 'Record removed.',
    'Próximas preventivas pelo horímetro. A previsão usa o uso médio dos últimos 30 dias.': 'Upcoming preventives by hour meter. The forecast uses the average usage of the last 30 days.',
    'Lançamento diário do horímetro de cada equipamento. O horímetro do quadro passa a ser a leitura com a coleta mais recente.': 'Daily hour meter entry for each unit. The board uses the reading with the most recent collection time.',
    'Cada frota segue um plano. Os intervalos definem as revisões do ciclo.': 'Each fleet follows a plan. The intervals define the services in the cycle.',
    'Informe o horímetro em que a preventiva foi feita.': 'Enter the hour meter at which the preventive was done.', 'Confira a data (não pode estar no futuro).': 'Check the date (it cannot be in the future).',
    'Parada preventiva': 'Preventive stop', 'Ao liberar o equipamento, a preventiva fica registrada no horímetro da parada e o contador recomeça.': 'When the unit is released, the preventive is recorded at the stop hour meter and the counter restarts.',
    'O equipamento entra na fila da manutenção como': 'The unit enters the maintenance queue as a', 'parada preventiva': 'preventive stop', '. Quando a manutenção liberar, a preventiva fica registrada.': '. When maintenance releases it, the preventive is recorded.',
    'Programada com a manutenção': 'Scheduled with maintenance', 'Voltar': 'Back',
    'Data e hora da coleta': 'Collection date and time', 'Agora': 'Now', 'Frota': 'Fleet', 'Todas as frotas': 'All fleets', 'Buscar': 'Search', 'TAG ou modelo': 'Tag or model',
    'Vale para todas as linhas. Se uma leitura foi feita em outro horário, use "outro horário" na linha dela.': 'Applies to every line. If a reading was taken at another time, use "other time" on its line.',
    'Colar do Excel': 'Paste from Excel', 'Salvar leituras': 'Save readings', 'Confirmar e salvar': 'Confirm and save', 'Última leitura': 'Last reading', 'Nova leitura (h)': 'New reading (h)', 'Horário da coleta': 'Collection time', 'Diferença': 'Difference',
    'Histórico': 'History', 'Fechar': 'Close', 'outro horário': 'other time', 'Sem leitura': 'No reading', 'Primeira leitura': 'First reading', 'Número inválido': 'Invalid number', 'Horário da coleta no futuro': 'Collection time in the future',
    'mais horas que o tempo passado': 'more hours than time elapsed', 'agora há pouco': 'just now', 'Já tem leitura nesta data': 'Already read on this date', 'Usar o horário do topo': 'Use the time at the top',
    'Nenhuma leitura registrada.': 'No readings yet.', 'Lançamento diário': 'Daily entry', 'Cadastro': 'Equipment', 'Correção': 'Correction', 'Leitura inicial': 'Initial reading', 'Remover leitura': 'Remove reading',
    'Digite pelo menos uma leitura.': 'Type at least one reading.', 'Leitura removida. O horímetro do equipamento voltou para a leitura anterior.': 'Reading removed. The unit hour meter went back to the previous reading.',
    'Preencher as leituras': 'Fill in the readings', 'Nenhuma linha reconhecida. Use TAG e horímetro, separados por tabulação ou ponto e vírgula.': 'No line recognized. Use tag and hour meter, separated by tab or semicolon.',
    'Copie as colunas da planilha e cole abaixo. Uma linha por equipamento: TAG e horímetro. Uma terceira coluna com a data e a hora da coleta é opcional (sem ela, vale o horário do topo).': 'Copy the spreadsheet columns and paste them below. One line per unit: tag and hour meter. A third column with the collection date and time is optional (without it, the time at the top applies).',
    'Novo plano': 'New plan', '+ Novo plano': '+ New plan', 'Editar plano': 'Edit plan', 'Nome do plano': 'Plan name', 'Intervalos (h)': 'Intervals (h)', 'Avisar quando faltarem (h)': 'Warn when remaining (h)',
    'Separe por vírgula. Com um só intervalo (ex.: 250), todas as revisões são iguais.': 'Separate with commas. With a single interval (e.g. 250), every service is the same.', 'O cartão do painel muda a partir daí.': 'The board card changes from then on.',
    'Ciclo': 'Cycle', 'depois recomeça': 'then restarts', 'Frotas': 'Fleets', 'Salvar plano': 'Save plan', 'Criar plano': 'Create plan', 'Limpar': 'Clear', 'Remover': 'Remove', 'Confirmar remoção': 'Confirm removal',
    'O plano vale para as frotas marcadas. A primeira revisão vem no menor intervalo depois da última feita.': 'The plan applies to the checked fleets. The next service comes at the smallest interval after the last one done.',
    'Plano salvo. Ele já vale para o painel.': 'Plan saved. It already applies to the board.', 'Plano removido.': 'Plan removed.', 'Nenhuma frota': 'No fleet', 'Dê um nome ao plano.': 'Name the plan.',
    'Já existe um plano com esse nome.': 'A plan with this name already exists.', 'Informe pelo menos um intervalo, em horas.': 'Enter at least one interval, in hours.',
    'Nenhum plano cadastrado. Crie o primeiro ao lado.': 'No plans yet. Create the first one alongside.',
    'Entre com seu usuário para ver as preventivas e lançar os horímetros.': 'Sign in to see preventives and enter hour meters.',
    'As leituras de horímetro são lançadas pelo planejamento.': 'Hour meter readings are entered by planning.', 'Informe o horímetro.': 'Enter the hour meter.', 'Informe a data e a hora da coleta.': 'Enter the collection date and time.',
    'A data da coleta não pode estar no futuro.': 'The collection date cannot be in the future.', 'Os planos de preventiva são cadastrados pelo planejamento.': 'Preventive plans are managed by planning.',
    'As preventivas são controladas pelo planejamento.': 'Preventives are managed by planning.', 'Equipamento não encontrado.': 'Unit not found.',
    'no horímetro': 'at hour meter', 'Tipo de parada': 'Stop type', 'Corretiva': 'Corrective', 'Leituras de horímetro': 'Hour meter readings', 'Preventivas feitas': 'Preventives done', 'Peças': 'Parts'
  });
  PAT.push(
    [/^Preventiva · (.+)$/, 'Preventive · $1'],
    [/^Parada preventiva · (.+)$/, 'Preventive stop · $1'],
    [/^(PM \d+) \(a próxima\)$/, '$1 (the next one)'],
    [/^faltam ([\d.,]+) h$/, '$1 h remaining'],
    [/^vencida há ([\d.,]+) h$/, 'overdue by $1 h'],
    [/^previsão (.+)$/, 'forecast $1'],
    [/^programada para (.+)$/, 'scheduled for $1'],
    [/^prog\. (.+)$/, 'sched. $1'],
    [/^uso médio ([\d,]+) h\/dia$/, 'average use $1 h/day'],
    [/^média ([\d,]+) h\/dia$/, 'average $1 h/day'],
    [/^([\d,]+) h\/dia$/, '$1 h/day'],
    [/^agora (.+ h)$/, 'now $1'],
    [/^em ([\d.,]+ h)$/, 'at $1'],
    [/^Plano (.+)\. O planejamento ainda não informou a última preventiva deste equipamento\.$/, 'Plan $1. Planning has not entered the last preventive of this unit yet.'],
    [/^Usar a sugestão nos (\d+) sem registro$/, 'Use the suggestion for the $1 without record'],
    [/^(\d+) equipamentos? sem plano$/, '$1 units without a plan'],
    [/^Histórico \((\d+)\)$/, 'History ($1)'],
    [/^Fechar histórico$/, 'Close history'],
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
    [/^aviso (\d+) h antes$/, 'warning $1 h before'],
    [/^hoje no plano (.+)$/, 'currently in plan $1'],
    [/^(\d+) (planos?|equipamentos?)$/, (m, n, w) => `${n} ${w.startsWith('plano') ? (n === '1' ? 'plan' : 'plans') : (n === '1' ? 'unit' : 'units')}`],
    [/^Enviado para a preventiva \((.+)\)\. A manutenção já vê este equipamento na fila\.$/, 'Sent to preventive ($1). Maintenance already sees this unit in the queue.'],
    [/^Última: (.+) em (.+) \((.+)\)$/, 'Last: $1 at $2 ($3)'],
    [/^sugestão: última (.+) em (.+)$/, 'suggestion: last $1 at $2'],
    [/^Preventivas de (.+)$/, 'Preventives of $1'],
    [/^Na de (.+) h faz-se a revisão completa, que já inclui as menores\.$/, 'At $1 h the full service is done, which includes the smaller ones.']
  );
  if (LANG === 'en' && typeof trTree === 'function') trTree(document.body);
}
