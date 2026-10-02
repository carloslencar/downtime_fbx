/*
 * Alarme sonoro do painel (vale só para o aparelho onde foi ligado).
 * Sons gerados pelo próprio navegador (Web Audio), sem arquivos nem internet.
 * - Nova parada: três bipes fortes.
 * - Equipamento liberado: carrilhão curto subindo.
 * - Peças solicitadas/adicionadas (planejamento) e peças recebidas (oficina).
 * - Lembrete: dois bipes, repetidos enquanto houver equipamento esperando atendimento além do limite.
 * Chamado por js/app.js: alarmeEvento(evento) a cada evento novo do painel.
 */
(function () {
  'use strict';
  const CHAVE = 'qp-alarme';
  const PADRAO = { on: false, nova: true, lib: true, pecas: true, chegada: true, lembrete: true, min: 15, vol: 80 };
  let cfg = { ...PADRAO };
  try { cfg = { ...PADRAO, ...(JSON.parse(localStorage.getItem(CHAVE) || '{}')) }; } catch (e) {}
  function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch (e) {} }

  /* ---------- som ---------- */
  let ctx = null;
  function contexto() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      ctx.onstatechange = atualizarAviso;
    }
    return ctx;
  }
  function tom(freq, ini, dur, tipo, vol) {
    const c = contexto(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + ini;
    o.type = tipo; o.frequency.setValueAtTime(freq, t);
    const v = Math.max(0.0001, (cfg.vol / 100) * vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.015);
    g.gain.setValueAtTime(v, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const SONS = {
    nova() { for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) tom(i % 2 ? 660 : 880, r * 1.1 + i * 0.26, 0.2, 'square', 0.35); },
    liberado() { [523, 659, 784].forEach((f, i) => tom(f, i * 0.18, 0.5, 'sine', 0.6)); },
    pecas() { [0, 0.5].forEach(o => { tom(587, o, 0.16, 'square', 0.3); tom(880, o + 0.18, 0.22, 'square', 0.3); }); },
    chegada() { tom(784, 0, 0.3, 'sine', 0.6); tom(1047, 0.2, 0.55, 'sine', 0.6); },
    lembrete() { tom(740, 0, 0.22, 'triangle', 0.6); tom(740, 0.34, 0.22, 'triangle', 0.6); }
  };
  function tocar(nome) {
    const c = contexto(); if (!c) return;
    if (c.state !== 'running') c.resume().catch(() => {});
    SONS[nome]();
  }

  // O navegador só libera som depois que alguém toca na tela uma vez (exceto no modo quiosque).
  function destravar() { const c = contexto(); if (c && c.state !== 'running') c.resume().then(atualizarAviso).catch(() => {}); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(t => document.addEventListener(t, destravar, { passive: true }));

  /* ---------- aviso "toque para ativar o som" ---------- */
  const aviso = document.createElement('button');
  aviso.type = 'button'; aviso.className = 'som-aviso'; aviso.hidden = true;
  aviso.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6h3l4-3v10l-4-3H2z"/><path d="M11.5 6l3 4M14.5 6l-3 4"/></svg><span>Toque para ativar o alarme sonoro</span>';
  aviso.addEventListener('click', () => { destravar(); setTimeout(atualizarAviso, 200); });
  document.body.appendChild(aviso);
  function atualizarAviso() {
    const bloqueado = cfg.on && (!ctx || ctx.state !== 'running');
    aviso.hidden = !bloqueado;
    const st = document.getElementById('c-som-bloq');
    if (st) st.hidden = !bloqueado;
  }

  /* ---------- eventos do painel ---------- */
  window.alarmeEvento = function (ev) {
    if (!cfg.on || !ev || Date.now() - ev.t > 120000) return; // ignora eventos antigos (ex.: ao reconectar)
    if (ev.status === 'aguardando' && ev.acao === 'Parada aberta' && cfg.nova) tocar('nova');
    else if (ev.status === 'liberado' && cfg.lib) tocar('liberado');
    else if ((ev.acao === 'Peças solicitadas' || ev.acao === 'Peças adicionadas') && cfg.pecas) tocar('pecas');
    else if (ev.acao === 'Peças recebidas' && cfg.chegada) tocar('chegada');
  };

  // Lembrete: repete a cada "min" minutos enquanto houver equipamento aguardando além do limite.
  let ultimoLembrete = 0;
  setInterval(() => {
    if (!cfg.on || !cfg.lembrete || !(cfg.min > 0) || typeof equip === 'undefined') return;
    const limite = cfg.min * 60000, agora = Date.now();
    const atrasado = Object.values(equip).some(e => e.ativo !== false && (e.status === 'aguardando' || e.status === 'pecas_recebidas') && (typeof daTela !== 'function' || daTela(e)) && agora - (e.desde || agora) > limite);
    if (atrasado && agora - ultimoLembrete >= limite) { ultimoLembrete = agora; tocar('lembrete'); }
    if (!atrasado) ultimoLembrete = 0;
  }, 30000);

  /* ---------- Configurações ---------- */
  const $ = s => document.querySelector(s);
  function render() {
    $('#c-som').checked = cfg.on;
    $('#c-som-t').textContent = cfg.on ? 'Ligado' : 'Desligado';
    $('#c-som-nova').checked = cfg.nova;
    $('#c-som-lib').checked = cfg.lib;
    $('#c-som-pecas').checked = cfg.pecas;
    $('#c-som-cheg').checked = cfg.chegada;
    $('#c-som-lemb').checked = cfg.lembrete;
    if (document.activeElement !== $('#c-som-min')) $('#c-som-min').value = cfg.min;
    $('#c-som-vol').value = cfg.vol;
    document.querySelectorAll('.som-sub').forEach(el => el.classList.toggle('off', !cfg.on));
    if (cfg.on) contexto(); // descobre já se o navegador vai bloquear o som
    atualizarAviso();
  }
  function mudar(patch, testar) {
    cfg = { ...cfg, ...patch }; salvar(); render();
    const st = $('#c-som-st'); if (st) { st.textContent = 'Salvo neste aparelho'; st.className = 'cfg-st ok'; clearTimeout(mudar.t); mudar.t = setTimeout(() => { st.textContent = ''; }, 3000); }
    if (testar) tocar(testar);
  }
  $('#c-som').addEventListener('change', e => mudar({ on: e.target.checked }, e.target.checked ? 'nova' : null));
  $('#c-som-nova').addEventListener('change', e => mudar({ nova: e.target.checked }, e.target.checked ? 'nova' : null));
  $('#c-som-lib').addEventListener('change', e => mudar({ lib: e.target.checked }, e.target.checked ? 'liberado' : null));
  $('#c-som-pecas').addEventListener('change', e => mudar({ pecas: e.target.checked }, e.target.checked ? 'pecas' : null));
  $('#c-som-cheg').addEventListener('change', e => mudar({ chegada: e.target.checked }, e.target.checked ? 'chegada' : null));
  $('#c-som-lemb').addEventListener('change', e => mudar({ lembrete: e.target.checked }, e.target.checked ? 'lembrete' : null));
  $('#c-som-min').addEventListener('change', e => { const v = Math.round(Number(e.target.value)); mudar({ min: v >= 1 && v <= 240 ? v : cfg.min }); });
  $('#c-som-vol').addEventListener('change', e => mudar({ vol: Math.max(5, Math.min(100, Number(e.target.value) || 80)) }, 'nova'));
  document.querySelectorAll('[data-som-teste]').forEach(b => b.addEventListener('click', () => { destravar(); tocar(b.dataset.somTeste); }));
  render();
})();
