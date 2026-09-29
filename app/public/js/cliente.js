/*
 * Cliente do servidor do Quadro de Paradas.
 * - window.dt.db: leitura e gravação dos registros, com atualização em tempo real (Server-Sent Events),
 *   cópia local para a TV continuar mostrando o último estado se a rede cair, e fila de gravações
 *   offline (paradas e equipamentos) que é enviada assim que a conexão volta.
 * - window.dt.downloads: salva arquivos gerados na tela (planilha, PDF, JPEG).
 * - window.dt.sessao/login/sair: login com PIN conferido no servidor.
 */
(function () {
  'use strict';
  const LS_CACHE = 'dt-cache-v1', LS_FILA = 'dt-fila-v1';
  const FILA_OK = new Set(['equipamentos', 'paradas', 'log']); // o que pode ficar na fila sem rede
  const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const enc = encodeURIComponent;
  function lsLer(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsGravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- HTTP ---------- */
  function erroRede() { return Object.assign(new Error('Sem conexão com o servidor'), { code: 'offline', rede: true }); }
  async function http(metodo, url, corpo) {
    let r;
    try {
      r = await fetch(url, {
        method: metodo, credentials: 'same-origin', cache: 'no-store',
        headers: corpo !== undefined || metodo !== 'GET' ? { 'Content-Type': 'application/json', 'X-DT': '1' } : {},
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined
      });
    } catch (e) { throw erroRede(); }
    if (r.status >= 502 && r.status <= 504) throw erroRede();
    let j = null;
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) {
      if (r.status === 401 && url !== '/api/login') window.dispatchEvent(new CustomEvent('dt-sessao-perdida'));
      throw Object.assign(new Error((j && j.erro) || 'Erro ' + r.status), { code: (j && j.code) || 'erro', status: r.status });
    }
    return j;
  }

  /* ---------- fontes de dados (uma por consulta) ---------- */
  const cacheLS = lsLer(LS_CACHE) || {};
  const fontes = {};
  let online = false, salvarCacheT = null;

  function fonte(col, q) {
    const sig = col + '|' + (q ? JSON.stringify(q) : '');
    if (!fontes[sig]) fontes[sig] = { sig, col, q, docs: cacheLS[sig] ? cacheLS[sig] : null, carregado: false, ouvintes: new Set() };
    return fontes[sig];
  }
  function salvarCache() {
    clearTimeout(salvarCacheT);
    salvarCacheT = setTimeout(() => {
      const out = {};
      for (const f of Object.values(fontes)) if (f.docs) out[f.sig] = f.docs;
      lsGravar(LS_CACHE, out);
    }, 400);
  }

  class DocSnap {
    constructor(id, d) { this.id = id; this._d = d; this.exists = d != null; }
    data() { return this._d == null ? undefined : clone(this._d); }
  }
  function ordenar(f, ids) {
    const q = f.q || {};
    if (!q.orderBy) return ids.sort();
    const k = q.orderBy, s = q.dir === 'asc' ? 1 : -1;
    return ids.sort((a, b) => ((Number(f.docs[a][k]) || 0) - (Number(f.docs[b][k]) || 0)) * s || (a < b ? -1 : 1));
  }
  function snapColecao(f, mud, fromCache) {
    const docs = f.docs || {};
    const lista = ordenar(f, Object.keys(docs)).map(id => new DocSnap(id, docs[id]));
    const ch = mud.map(m => ({ type: m.type, doc: new DocSnap(m.id, m.type === 'removed' ? m.antes : docs[m.id]) }));
    return { empty: lista.length === 0, size: lista.length, docs: lista, docChanges: () => ch, metadata: { fromCache } };
  }

  // Avisa quem está ouvindo. mud = [{type:'added'|'modified'|'removed', id, antes}]
  function notificar(f, mud, forcar) {
    const fromCache = !online || !f.carregado;
    for (const o of f.ouvintes) {
      try {
        if (o.tipo === 'col') {
          if (o.primeiro) {
            if (!f.docs) continue;
            o.primeiro = false; o.fromCache = fromCache;
            o.cb(snapColecao(f, Object.keys(f.docs).map(id => ({ type: 'added', id })), fromCache));
          } else if (mud.length || forcar || o.fromCache !== fromCache) {
            o.fromCache = fromCache;
            o.cb(snapColecao(f, mud, fromCache));
          }
        } else {
          if (!f.docs) continue;
          const d = f.docs[o.id] === undefined ? null : f.docs[o.id];
          if (o.primeiro || !igual(d, o.ultimo)) {
            o.primeiro = false; o.ultimo = clone(d);
            o.cb(Object.assign(new DocSnap(o.id, d), { metadata: { fromCache } }));
          }
        }
      } catch (e) { console.error('[dt] erro ao atualizar a tela', e); }
    }
  }

  function aplicar(col, id, data) {
    for (const f of Object.values(fontes)) {
      if (f.col !== col || !f.docs) continue;
      const antes = f.docs[id];
      if (data == null) {
        if (antes === undefined) continue;
        delete f.docs[id];
        notificar(f, [{ type: 'removed', id, antes }]);
      } else {
        if (igual(antes, data)) continue;
        f.docs[id] = clone(data);
        notificar(f, [{ type: antes === undefined ? 'added' : 'modified', id }]);
      }
    }
    salvarCache();
  }

  function urlLista(col, q) {
    const p = new URLSearchParams();
    if (q && q.orderBy) { p.set('ordem', q.orderBy); p.set('dir', q.dir || 'asc'); }
    if (q && q.limit) p.set('limite', q.limit);
    const s = p.toString();
    return '/api/docs/' + enc(col) + (s ? '?' + s : '');
  }

  async function sincronizar(f) {
    const j = await http('GET', urlLista(f.col, f.q));
    const novo = {};
    for (const d of j.docs) novo[d.id] = d.data;
    const velho = f.docs || {}, mud = [];
    for (const id of Object.keys(velho)) if (!(id in novo)) mud.push({ type: 'removed', id, antes: velho[id] });
    for (const id of Object.keys(novo)) {
      if (!(id in velho)) mud.push({ type: 'added', id });
      else if (!igual(velho[id], novo[id])) mud.push({ type: 'modified', id });
    }
    const primeiraVez = !f.carregado;
    f.docs = novo; f.carregado = true;
    notificar(f, mud, primeiraVez);
    salvarCache();
  }

  let sincronizando = null;
  function sincronizarTudo() {
    if (sincronizando) return sincronizando;
    sincronizando = (async () => {
      await esvaziarFila();
      await Promise.all(Object.values(fontes).filter(f => f.ouvintes.size).map(f => sincronizar(f).catch(e => {
        f.ouvintes.forEach(o => o.err && o.err(e));
      })));
    })().finally(() => { sincronizando = null; });
    return sincronizando;
  }

  /* ---------- tempo real ---------- */
  let es = null, ultimoSinal = 0, conectado = false;
  function conectar() {
    if (es) { try { es.close(); } catch (e) {} }
    es = new EventSource('/api/stream');
    ultimoSinal = Date.now();
    es.addEventListener('ola', ev => {
      ultimoSinal = Date.now();
      try { verificarVersao(JSON.parse(ev.data).versao); } catch (e) {}
      online = true; conectado = true;
      sincronizarTudo();
    });
    es.addEventListener('ping', () => { ultimoSinal = Date.now(); });
    es.onmessage = ev => {
      ultimoSinal = Date.now();
      try { const m = JSON.parse(ev.data); aplicar(m.col, m.id, m.data); } catch (e) {}
    };
    es.onerror = () => { if (online) { online = false; avisarStatus(); } };
  }
  // Sistema atualizado no servidor: recarrega a tela quando ninguém estiver no meio de um lançamento.
  let versao = null, recarregar = false;
  function verificarVersao(v) {
    if (!v) return;
    if (versao && v !== versao) recarregar = true;
    versao = versao || v;
    tentarRecarregar();
  }
  function tentarRecarregar() {
    if (!recarregar) return;
    const ocupado = document.querySelector('.modal:not([hidden])') ||
      (document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName));
    if (ocupado || fila.length) { setTimeout(tentarRecarregar, 30000); return; }
    location.reload();
  }
  function avisarStatus() { for (const f of Object.values(fontes)) notificar(f, [], true); }
  function garantirConexao() { if (!conectado && !es) conectar(); }
  // Vigia: sem sinal por 50 s (rede caiu sem aviso), reconecta.
  setInterval(() => {
    if (!es) return;
    if (Date.now() - ultimoSinal > 50000) { online = false; avisarStatus(); conectar(); }
  }, 10000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && es && Date.now() - ultimoSinal > 25000) conectar();
  });

  /* ---------- fila de gravações sem rede ---------- */
  let fila = lsLer(LS_FILA) || [];
  let esvaziando = null;
  function esvaziarFila() {
    if (esvaziando) return esvaziando;
    esvaziando = (async () => {
      let recusou = false;
      while (fila.length) {
        const it = fila[0];
        try {
          const r = await http(it.op === 'set' ? 'PUT' : 'DELETE', '/api/docs/' + enc(it.col) + '/' + enc(it.id), it.op === 'set' ? it.data : undefined);
          if (r && r.id) aplicar(it.col, it.id, r.data);
        } catch (e) {
          if (e.rede) break;
          recusou = true;
          console.warn('[dt] gravação da fila recusada pelo servidor:', it.col + '/' + it.id, e.message);
        }
        fila.shift(); lsGravar(LS_FILA, fila);
      }
      if (recusou) window.dispatchEvent(new CustomEvent('dt-fila-recusada'));
    })().finally(() => { esvaziando = null; });
    return esvaziando;
  }
  setInterval(() => { if (fila.length) esvaziarFila().catch(() => {}); }, 15000);

  async function escrever(op, col, id, data) {
    const url = '/api/docs/' + enc(col) + '/' + enc(id);
    try {
      if (fila.length) await esvaziarFila();
      if (fila.length) throw erroRede();
      const r = await http(op === 'set' ? 'PUT' : 'DELETE', url, op === 'set' ? data : undefined);
      aplicar(col, id, r ? r.data : null);
    } catch (e) {
      if (!e.rede || !FILA_OK.has(col)) throw e;
      fila.push({ op, col, id, data: op === 'set' ? clone(data) : null, t: Date.now() });
      lsGravar(LS_FILA, fila);
      aplicar(col, id, op === 'set' ? data : null);
    }
  }

  /* ---------- API no formato usado pela tela ---------- */
  function refDoc(caminho) {
    const i = caminho.indexOf('/'), col = caminho.slice(0, i), id = caminho.slice(i + 1);
    return {
      id,
      set: data => escrever('set', col, id, clone(data)),
      delete: () => escrever('delete', col, id),
      get: async () => { const j = await http('GET', '/api/docs/' + enc(col) + '/' + enc(id)).catch(e => { if (e.status === 404) return null; throw e; }); return new DocSnap(id, j ? j.data : null); },
      onSnapshot(cb, err) {
        const f = fonte(col, null), o = { tipo: 'doc', id, cb, err, primeiro: true };
        f.ouvintes.add(o);
        if (f.docs) setTimeout(() => notificar(f, []), 0);
        if (online) sincronizar(f).catch(e => err && err(e));
        garantirConexao();
        return () => f.ouvintes.delete(o);
      }
    };
  }
  function consulta(col, q) {
    return {
      orderBy: (campo, dir) => consulta(col, { ...q, orderBy: campo, dir: dir || 'asc' }),
      limit: n => consulta(col, { ...q, limit: n }),
      get: async () => {
        const j = await http('GET', urlLista(col, q));
        const docs = j.docs.map(d => new DocSnap(d.id, d.data));
        return { empty: !docs.length, size: docs.length, docs };
      },
      onSnapshot(cb, err) {
        const f = fonte(col, q && Object.keys(q).length ? q : null), o = { tipo: 'col', cb, err, primeiro: true };
        f.ouvintes.add(o);
        if (f.docs) setTimeout(() => notificar(f, []), 0);
        if (online) sincronizar(f).catch(e => err && err(e));
        garantirConexao();
        return () => f.ouvintes.delete(o);
      }
    };
  }
  const db = { doc: refDoc, collection: col => consulta(col, {}) };

  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
      return { status: 'saved' };
    }
  };

  window.dt = {
    db, downloads,
    pendentes: () => fila.length,
    async sessao() { const j = await http('GET', '/api/sessao'); return j.usuario; },
    async login(id, pin) {
      try { const j = await http('POST', '/api/login', { id, pin }); return { ok: true, usuario: j.usuario }; }
      catch (e) { return { ok: false, erro: e.rede ? 'rede' : 'pin' }; }
    },
    async sair() { try { await http('POST', '/api/sair', {}); } catch (e) {} },
    async paradasPeriodo(de, ate) {
      const p = new URLSearchParams({ ordem: 'inicio', dir: 'desc' });
      if (de != null) p.set('de', de);
      if (ate != null) p.set('ate', ate);
      const j = await http('GET', '/api/docs/paradas?' + p);
      return j.docs.map(d => d.data);
    },
    relatorios: () => http('GET', '/api/relatorios'),
    novaChaveRelatorios: () => http('POST', '/api/relatorios/nova-chave', {})
  };
})();
