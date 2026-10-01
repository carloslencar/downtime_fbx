'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const docs = require('./docs');
const relatorios = require('./relatorios');
const seed = require('./seed');

const COOKIE = 'dt_sessao';
// Versão da interface: quando muda (sistema atualizado), as telas abertas recarregam sozinhas.
const VERSAO = (() => {
  const h = crypto.createHash('sha1');
  const andar = d => { for (const n of fs.readdirSync(d).sort()) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) { if (n !== 'fonts') andar(p); } else h.update(n).update(fs.readFileSync(p)); } };
  try { andar(config.publicDir); } catch (e) {}
  return h.digest('hex').slice(0, 12);
})();
const DEZ_ANOS = 10 * 365 * 24 * 3600;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8'
};

/* ---------- utilidades HTTP ---------- */
function lerCookies(req) {
  const out = {};
  for (const p of String(req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return out;
}
function https(req) { return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'; }
function cookieSessao(req, token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https(req) ? '; Secure' : ''}`;
}
function json(res, status, corpo, extra = {}) {
  const b = JSON.stringify(corpo);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(b);
}
function erro(res, status, mensagem) {
  const code = status === 401 || status === 403 ? 'invalid_argument' : status === 404 ? 'not_found' : 'erro';
  json(res, status, { erro: mensagem, code });
}
function lerCorpo(req, limite = 1024 * 1024) {
  return new Promise((ok, falha) => {
    let tam = 0; const partes = [];
    req.on('data', c => {
      tam += c.length;
      if (tam > limite) { falha(Object.assign(new Error('Corpo grande demais.'), { status: 413 })); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (!partes.length) return ok(null);
      try { ok(JSON.parse(Buffer.concat(partes).toString('utf8'))); }
      catch (e) { falha(Object.assign(new Error('JSON inválido.'), { status: 400 })); }
    });
    req.on('error', falha);
  });
}
function baseUrl(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  return `${https(req) ? 'https' : 'http'}://${host}/`;
}

/* ---------- tempo real (Server-Sent Events) ---------- */
const clientes = new Set();
docs.mudancas.on('mudanca', m => {
  const msg = `data: ${JSON.stringify(m)}\n\n`;
  for (const res of clientes) res.write(msg);
});
setInterval(() => { for (const res of clientes) res.write('event: ping\ndata: {}\n\n'); }, 20000).unref();

function stream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n');
  res.write(`event: ola\ndata: ${JSON.stringify({ t: Date.now(), versao: VERSAO })}\n\n`);
  clientes.add(res);
  req.on('close', () => clientes.delete(res));
}

/* ---------- arquivos estáticos ---------- */
function estatico(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const arq = path.normalize(path.join(config.publicDir, rel));
  if (!arq.startsWith(path.normalize(config.publicDir + path.sep))) return erro(res, 404, 'Não encontrado.');
  fs.stat(arq, (e, st) => {
    if (e || !st.isFile()) {
      // Rotas da interface (ex.: /#cadastro) caem no index.
      if (!path.extname(rel)) return estatico(req, res, '/');
      return erro(res, 404, 'Não encontrado.');
    }
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const longo = /^\/(fonts|vendor)\//.test(rel);
    const cab = {
      'Content-Type': MIME[path.extname(arq).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': longo ? 'public, max-age=2592000' : 'no-cache',
      'ETag': etag,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin'
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, cab); return res.end(); }
    res.writeHead(200, { ...cab, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(arq).pipe(res);
  });
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const partes = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); // ['api', ...]
  const token = lerCookies(req)[COOKIE];
  const metodo = req.method;
  const mutacao = metodo !== 'GET' && metodo !== 'HEAD';
  // Proteção contra envio de outro site: toda alteração precisa deste cabeçalho.
  if (mutacao && req.headers['x-dt'] !== '1') return erro(res, 403, 'Requisição recusada.');

  if (partes[1] === 'saude') {
    try { await db.pool.query('select 1'); return json(res, 200, { ok: true, clientes: clientes.size }); }
    catch (e) { return json(res, 503, { ok: false }); }
  }
  if (partes[1] === 'stream' && metodo === 'GET') return stream(req, res);

  if (partes[1] === 'sessao' && metodo === 'GET') {
    const u = await auth.usuarioDaSessao(token);
    return json(res, 200, { usuario: u ? docs.publico('usuarios', u) : null });
  }
  if (partes[1] === 'login' && metodo === 'POST') {
    const b = await lerCorpo(req) || {};
    const u = /^\d{4}$/.test(String(b.pin || '')) && typeof b.id === 'string' ? await auth.login(b.id, b.pin) : null;
    if (!u) { await new Promise(r => setTimeout(r, 400)); return json(res, 401, { erro: 'PIN incorreto.', code: 'pin' }); }
    if (token) await auth.encerrarSessao(token);
    const novo = await auth.criarSessao(b.id, req.headers['user-agent']);
    return json(res, 200, { usuario: docs.publico('usuarios', { id: b.id, ...u }) }, { 'Set-Cookie': cookieSessao(req, novo, DEZ_ANOS) });
  }
  if (partes[1] === 'sair' && metodo === 'POST') {
    await auth.encerrarSessao(token);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookieSessao(req, '', 0) });
  }

  if (partes[1] === 'docs' && partes[2]) {
    const col = partes[2], id = partes[3];
    if (metodo === 'GET' && !id) {
      const q = url.searchParams, num = k => (q.get(k) != null && q.get(k) !== '' && isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
      return json(res, 200, { docs: await docs.listar(col, { ordem: q.get('ordem'), dir: q.get('dir'), limite: num('limite'), de: num('de'), ate: num('ate') }) });
    }
    if (metodo === 'GET' && id) {
      const d = await docs.ler(col, id);
      return d ? json(res, 200, d) : json(res, 404, { erro: 'Não encontrado.', code: 'not_found' });
    }
    if ((metodo === 'PUT' || metodo === 'DELETE') && id) {
      const usuario = await auth.usuarioDaSessao(token);
      const dados = metodo === 'PUT' ? await lerCorpo(req) : null;
      try {
        const r = await docs.gravar({ usuario, col, id, op: metodo === 'PUT' ? 'set' : 'delete', dados });
        return json(res, 200, r);
      } catch (e) {
        if (e instanceof docs.ErroRegra) return erro(res, e.status, e.message);
        throw e;
      }
    }
  }

  if (partes[1] === 'relatorios') {
    const m = partes[2] && /^([a-z]+)\.csv$/.exec(partes[2]);
    if (m && metodo === 'GET') {
      const ch = await relatorios.chave();
      if (!relatorios.iguais(url.searchParams.get('chave'), ch)) return erro(res, 403, 'Chave de relatório inválida.');
      const corpo = await relatorios.csv(m[1], { de: url.searchParams.get('de'), ate: url.searchParams.get('ate') });
      if (corpo == null) return erro(res, 404, 'Relatório desconhecido.');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="quadro-de-paradas-${m[1]}.csv"`
      });
      return res.end(corpo);
    }
    const u = await auth.usuarioDaSessao(token);
    if (!u || u.perfil !== 'admin') return erro(res, 403, 'Só o administrador acessa os relatórios.');
    if (!partes[2] && metodo === 'GET') {
      const ch = await relatorios.chave(), base = baseUrl(req);
      const tabelas = Object.keys(relatorios.TABELAS).map(nome => ({
        nome, url: `${base}api/relatorios/${nome}.csv?chave=${encodeURIComponent(ch)}`, m: relatorios.codigoM(nome, base, ch)
      }));
      return json(res, 200, { chave: ch, fixa: !!config.relatoriosChave, base, tabelas });
    }
    if (partes[2] === 'nova-chave' && metodo === 'POST') {
      if (config.relatoriosChave) return erro(res, 409, 'A chave está definida no arquivo .env (RELATORIOS_CHAVE).');
      await db.setMeta('relatorios_chave', crypto.randomBytes(18).toString('base64url'));
      return json(res, 200, { ok: true });
    }
  }
  return erro(res, 404, 'Não encontrado.');
}

function criarServidor() {
  return http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch (e) { return erro(res, 400, 'Endereço inválido.'); }
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return erro(res, 405, 'Método não permitido.');
      return estatico(req, res, url.pathname);
    } catch (e) {
      if (e && e.status) return erro(res, e.status, e.message);
      console.error('[api]', req.method, url.pathname, e);
      if (!res.headersSent) erro(res, 500, 'Erro interno.');
      else res.end();
    }
  });
}

async function iniciar() {
  await db.esperarBanco();
  await db.migrar();
  await seed.importarInicial();
  await seed.recuperarAdmin();
  await docs.numerarParadas();
  const srv = criarServidor();
  srv.keepAliveTimeout = 65000;
  await new Promise(ok => srv.listen(config.porta, ok));
  console.log(`[app] Quadro de Paradas no ar na porta ${config.porta} (fuso ${config.tz})`);
  const parar = () => { console.log('[app] encerrando'); for (const c of clientes) c.end(); srv.close(() => db.pool.end().then(() => process.exit(0))); setTimeout(() => process.exit(0), 5000).unref(); };
  process.on('SIGTERM', parar);
  process.on('SIGINT', parar);
  return srv;
}

if (require.main === module) {
  iniciar().catch(e => { console.error('[app] falha ao iniciar:', e); process.exit(1); });
}

module.exports = { criarServidor, iniciar };
