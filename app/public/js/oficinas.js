/* ---------- Oficinas (bases de manutenção) ----------
   Cada equipamento pertence a uma oficina (cadastro) e cada mecânico a uma oficina (usuários).
   Cada tela pode mostrar só uma oficina: Configurações › Esta tela, ou no endereço ?oficina=norte
   (bom para TVs em modo quiosque). Carregado antes de js/app.js. */
let oficinas = [];            // [{id, nome}]
let oficinasCarregadas = false;
let oficinaTela = '';          // id da oficina desta tela ('' = todas)
let oficinasMsg = '';
const CHAVE_OFICINA = 'qp-oficina';

function slugOficina(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
function oficinaPorId(id) { return oficinas.find(o => o.id === id) || null; }
function nomeOficina(id) { const o = oficinaPorId(id); return o ? o.nome : ''; }
// Equipamento entra nesta tela? (sem filtro, ou filtro de uma oficina que não existe mais = mostra tudo)
function daTela(e) { return !oficinaTela || !oficinaPorId(oficinaTela) || (e && e.oficina === oficinaTela); }
function filtroAtivo() { return !!(oficinaTela && oficinaPorId(oficinaTela)); }

try { oficinaTela = localStorage.getItem(CHAVE_OFICINA) || ''; } catch (e) {}
// ?oficina=norte no endereço: vale para esta tela e fica salvo (TV em modo quiosque)
let oficinaDoEndereco = null;
try { const p = new URLSearchParams(location.search); if (p.has('oficina')) oficinaDoEndereco = p.get('oficina') || ''; } catch (e) {}

function aplicarOficinaDoEndereco() {
  if (oficinaDoEndereco === null) return;
  const q = slugOficina(oficinaDoEndereco);
  const o = oficinas.find(x => x.id === oficinaDoEndereco || x.id === q || slugOficina(x.nome) === q);
  if (q === '' || q === 'todas') definirOficinaTela('');
  else if (o) definirOficinaTela(o.id);
}
function definirOficinaTela(id) {
  oficinaTela = id || '';
  try { localStorage.setItem(CHAVE_OFICINA, oficinaTela); } catch (e) {}
  aoMudarOficinas();
}
function aoMudarOficinas() {
  const marca = document.getElementById('marca-ofi');
  if (marca) { marca.textContent = filtroAtivo() ? nomeOficina(oficinaTela) : ''; marca.hidden = !filtroAtivo(); }
  if (typeof render === 'function') { estruturaSig = ''; render(); }
  if (typeof renderCfg === 'function' && vista === 'config') renderCfg();
  if (typeof renderPecas === 'function' && vista === 'pecas') renderPecas();
  if (typeof renderForm === 'function' && vista === 'cadastro' && fd && document.getElementById('f-ofi')) { lerForm(); renderForm(); }
  if (typeof renderUForm === 'function' && vista === 'usuarios' && document.getElementById('uf-ofi')) { lerUForm(); renderUForm(); }
  renderOficinaCfg();
}

window.dt.db.doc('config/oficinas').onSnapshot(s => {
  const l = s.exists && Array.isArray(s.data().lista) ? s.data().lista : [];
  oficinas = l.filter(o => o && o.id && o.nome).map(o => ({ id: o.id, nome: o.nome }));
  oficinasCarregadas = true;
  aplicarOficinaDoEndereco();
  if (!document.getElementById('oficinas').hidden) renderOficinas();
  aoMudarOficinas();
}, () => {});

/* ---------- Configurações › Esta tela ---------- */
function renderOficinaCfg() {
  const sel = document.getElementById('c-ofi');
  if (!sel) return;
  sel.innerHTML = `<option value="">Todas as oficinas</option>` + oficinas.map(o => `<option value="${esc(o.id)}">${esc(o.nome)}</option>`).join('');
  sel.value = filtroAtivo() ? oficinaTela : '';
  sel.disabled = !oficinas.length;
  const dica = document.getElementById('c-ofi-link');
  if (dica) dica.textContent = filtroAtivo() ? `Endereço para a TV desta oficina: ${location.origin}/?oficina=${oficinaTela}` : (oficinas.length ? 'Mostrando todas as oficinas.' : 'Nenhuma oficina cadastrada ainda. O administrador cadastra em Cadastro › Oficinas.');
}
document.getElementById('c-ofi').addEventListener('change', e => {
  definirOficinaTela(e.target.value);
  const st = document.getElementById('c-lang-st'); if (st) { st.textContent = 'Salvo neste aparelho'; st.className = 'cfg-st ok'; setTimeout(() => { st.textContent = ''; }, 3000); }
});

/* ---------- Cadastro de oficinas (administrador) ---------- */
function contaOficina(id) {
  return { eq: Object.values(equip).filter(e => e.oficina === id).length, mec: Object.values(usuarios).filter(u => u.oficina === id).length };
}
function abrirOficinas() { if (!ehAdmin()) return; oficinasMsg = ''; document.getElementById('oficinas').hidden = false; renderOficinas(); }
function fecharOficinas() { document.getElementById('oficinas').hidden = true; if (vista === 'cadastro' && fd && document.getElementById('f-ofi')) { lerForm(); renderForm(); } }
function renderOficinas() {
  const l = oficinas;
  document.getElementById('oficinas-dlg').innerHTML = `<div class="d-h lh"><div><h2 id="oficinas-t">Oficinas</h2><p>Bases de manutenção. Cada equipamento e cada mecânico pertencem a uma oficina, e cada TV pode mostrar só a sua.</p></div><button type="button" class="x" data-o="fechar" aria-label="Fechar">×</button></div>
    <div class="ar-lista">${l.length ? l.map((o, i) => { const c = contaOficina(o.id); const usado = c.eq || c.mec; return `<div class="ar-row"><input type="text" id="of-${i}" value="${esc(o.nome)}" maxlength="40" aria-label="Nome da oficina"><span class="ar-n">${c.eq} ${c.eq === 1 ? 'equipamento' : 'equipamentos'} · ${c.mec} ${c.mec === 1 ? 'mecânico' : 'mecânicos'}</span><button type="button" data-o="salvar" data-i="${i}">Salvar</button><button type="button" class="rmx" data-o="remover" data-i="${i}"${usado ? ' disabled title="Mova os equipamentos e mecânicos para outra oficina antes de remover"' : ''}>Remover</button></div>`; }).join('') : '<p class="vazio">Nenhuma oficina cadastrada.</p>'}</div>
    <div class="ar-nova"><input type="text" id="of-novo" maxlength="40" placeholder="Oficina Norte" aria-label="Nova oficina"><button type="button" class="salvar" data-o="add">Adicionar oficina</button></div>
    <p class="qr-st${oficinasMsg.startsWith('!') ? ' er' : ' ok'}" role="status">${esc(oficinasMsg.replace(/^!/, ''))}</p>`;
}
async function gravarOficinas(lista) {
  await window.dt.db.doc('config/oficinas').set({ lista });
  oficinas = lista;
}
async function acaoOficina(a, i) {
  if (!ehAdmin()) return;
  const l = oficinas.map(o => ({ ...o }));
  const repetido = (n, ignorarId) => l.some(o => o.nome.toLowerCase() === n.toLowerCase() && o.id !== ignorarId);
  try {
    if (a === 'add') {
      const n = (document.getElementById('of-novo').value || '').trim();
      if (!n) { oficinasMsg = '!Informe o nome da oficina.'; renderOficinas(); return; }
      if (repetido(n)) { oficinasMsg = '!Já existe uma oficina com esse nome.'; renderOficinas(); return; }
      let id = slugOficina(n) || 'oficina', k = 2; while (l.some(o => o.id === id)) id = slugOficina(n) + '-' + (k++);
      await gravarOficinas([...l, { id, nome: n }]); oficinasMsg = 'Oficina adicionada.';
    } else if (a === 'salvar') {
      const n = (document.getElementById('of-' + i).value || '').trim();
      if (!n) { oficinasMsg = '!Informe o nome da oficina.'; renderOficinas(); return; }
      if (repetido(n, l[i].id)) { oficinasMsg = '!Já existe uma oficina com esse nome.'; renderOficinas(); return; }
      l[i].nome = n; await gravarOficinas(l); oficinasMsg = 'Oficina renomeada.';
    } else if (a === 'remover') {
      const c = contaOficina(l[i].id);
      if (c.eq || c.mec) { oficinasMsg = '!Mova os equipamentos e mecânicos para outra oficina antes de remover.'; renderOficinas(); return; }
      await gravarOficinas(l.filter((_, k) => k !== i)); oficinasMsg = 'Oficina removida.';
    }
  } catch (er) { oficinasMsg = '!' + (er && er.code === 'invalid_argument' ? 'Só o administrador muda as oficinas.' : 'Não foi possível salvar. Tente de novo.'); }
  renderOficinas(); aoMudarOficinas();
}
document.getElementById('oficinas-dlg').addEventListener('click', ev => { const b = ev.target.closest('[data-o]'); if (!b) return; if (b.dataset.o === 'fechar') return fecharOficinas(); acaoOficina(b.dataset.o, Number(b.dataset.i)); });
document.getElementById('oficinas-dlg').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'of-novo') acaoOficina('add'); });
document.getElementById('oficinas').addEventListener('click', e => { if (e.target.id === 'oficinas') fecharOficinas(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('oficinas').hidden) fecharOficinas(); });
