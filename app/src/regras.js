'use strict';
// Regras de quem pode gravar o quê. Conferidas no servidor em toda gravação.

const COLECOES = new Set(['equipamentos', 'paradas', 'usuarios', 'config', 'log', 'pecas', 'leituras', 'preventivas']);
const PERFIS = new Set(['operacao', 'manutencao', 'planejador', 'admin']);
// Campos de uma peça que só o planejamento (ou o administrador) altera.
const CAMPOS_PLANEJAMENTO = ['oc', 'chegou'];
const ID_OK = /^[A-Za-z0-9_.:@+-]{1,120}$/;

function negar(status, mensagem) { return { status, mensagem }; }

/**
 * @param {object} p
 * @param {object|null} p.usuario   usuário logado (ou null)
 * @param {string} p.col            coleção
 * @param {string} p.id             id do documento
 * @param {'set'|'delete'} p.op
 * @param {object|null} p.anterior  documento atual no banco
 * @param {object|null} p.novo      documento enviado (set)
 * @param {number} p.adminsAtivos   quantos administradores ativos existem
 * @param {boolean} p.haUsuarios    existe algum usuário ativo cadastrado
 * @returns {null|{status:number,mensagem:string}} null = pode gravar
 */
function verificar({ usuario, col, id, op, anterior, novo, adminsAtivos = 0, haUsuarios = true, agora = Date.now() }) {
  if (!COLECOES.has(col)) return negar(404, 'Coleção desconhecida.');
  if (!ID_OK.test(id)) return negar(400, 'Identificador inválido.');
  if (op === 'set' && (!novo || typeof novo !== 'object' || Array.isArray(novo))) return negar(400, 'Documento inválido.');

  // Primeiro acesso de uma base vazia: qualquer pessoa cria o primeiro administrador.
  if (!usuario) {
    if (col === 'usuarios' && op === 'set' && !haUsuarios && novo.perfil === 'admin' && novo.ativo !== false) return null;
    return negar(401, 'Entre com seu usuário para registrar alterações.');
  }
  const admin = usuario.perfil === 'admin';
  const plan = usuario.perfil === 'planejador' || admin;

  if (col === 'config') {
    if (op !== 'set') return negar(403, 'Configurações não podem ser removidas.');
    if (id === 'frotas') return null;
    if (id === 'opcoes' || id === 'areas' || id === 'oficinas') return admin ? null : negar(403, 'Só o administrador muda estas opções.');
    if (id === 'planos') {
      if (!plan) return negar(403, 'Os planos de preventiva são cadastrados pelo planejamento.');
      if (!Array.isArray(novo.lista)) return negar(400, 'Documento inválido.');
      for (const p of novo.lista) {
        const iv = Array.isArray(p && p.intervalos) ? p.intervalos.map(Number) : [];
        if (!p || !String(p.nome || '').trim() || !iv.length || iv.some(n => !Number.isInteger(n) || n <= 0 || n % iv[0] !== 0)) {
          return negar(400, 'Plano inválido: os intervalos precisam ser múltiplos do primeiro (ex.: 250, 500, 1000).');
        }
      }
      return null;
    }
    return negar(404, 'Configuração desconhecida.');
  }
  if (col === 'log') {
    if (id !== 'feed' || op !== 'set') return negar(403, 'Operação não permitida.');
    if (!Array.isArray(novo.eventos)) return negar(400, 'Documento inválido.');
    return null;
  }
  if (col === 'usuarios') {
    const envolveAdmin = (novo && novo.perfil === 'admin') || (anterior && anterior.perfil === 'admin');
    if (envolveAdmin && !admin) return negar(403, 'Só um administrador pode criar ou alterar administradores.');
    if (op === 'set' && !PERFIS.has(novo.perfil)) return negar(400, 'Perfil inválido.');
    if (id === usuario.id) {
      if (op === 'delete') return negar(403, 'Você não pode remover o seu próprio usuário.');
      if (novo.ativo === false) return negar(403, 'Você não pode bloquear o seu próprio acesso.');
    }
    const eraAdminAtivo = anterior && anterior.perfil === 'admin' && anterior.ativo !== false;
    const continuaAdminAtivo = op === 'set' && novo.perfil === 'admin' && novo.ativo !== false;
    if (eraAdminAtivo && !continuaAdminAtivo && adminsAtivos <= 1) return negar(403, 'Este é o único administrador ativo.');
    return null;
  }
  // Leituras de horímetro (lançamento diário): planejamento e administrador.
  if (col === 'leituras') {
    if (!plan) return negar(403, 'As leituras de horímetro são lançadas pelo planejamento.');
    if (op === 'delete') return null;
    const v = Number(novo.valor), t = Number(novo.capturadaEm);
    if (!novo.tag || !Number.isFinite(v) || v < 0 || novo.valor === '' || novo.valor == null) return negar(400, 'Informe o horímetro.');
    if (!Number.isFinite(t) || t <= 0) return negar(400, 'Informe a data e a hora da coleta.');
    if (t > agora + 10 * 60000) return negar(400, 'A data da coleta não pode estar no futuro.');
    return null;
  }
  // Registro das preventivas de cada equipamento (id = TAG).
  if (col === 'preventivas') {
    if (op === 'delete') return admin ? null : negar(403, 'Só o administrador remove este registro.');
    if (!plan) return negar(403, 'As preventivas são controladas pelo planejamento.');
    if (!Array.isArray(novo.historico || [])) return negar(400, 'Documento inválido.');
    return null;
  }
  if (col === 'pecas') {
    if (op === 'delete') return admin ? null : negar(403, 'Peças não são apagadas: cancele o item.');
    if (!plan && usuario.perfil !== 'manutencao') return negar(403, 'Só a manutenção e o planejamento mexem na lista de peças.');
    if (!novo.paradaId || !String(novo.descricao || '').trim()) return negar(400, 'Informe a peça.');
    if (!plan) {
      const antes = anterior || {};
      for (const k of CAMPOS_PLANEJAMENTO) {
        if (JSON.stringify(antes[k] ?? null) !== JSON.stringify(novo[k] ?? null) && !(anterior == null && !novo[k])) {
          return negar(403, 'Ordem de compra e chegada da peça são marcadas pelo planejamento.');
        }
      }
    }
    return null;
  }
  if (col === 'paradas' && op === 'delete' && !admin) return negar(403, 'Só o administrador remove paradas.');
  return null; // equipamentos e paradas: operação, manutenção e administrador
}

module.exports = { verificar, COLECOES, PERFIS };
