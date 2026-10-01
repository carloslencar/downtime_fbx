'use strict';
// Regras de quem pode gravar o quê. Conferidas no servidor em toda gravação.

const COLECOES = new Set(['equipamentos', 'paradas', 'usuarios', 'config', 'log', 'pecas']);
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
function verificar({ usuario, col, id, op, anterior, novo, adminsAtivos = 0, haUsuarios = true }) {
  if (!COLECOES.has(col)) return negar(404, 'Coleção desconhecida.');
  if (!ID_OK.test(id)) return negar(400, 'Identificador inválido.');
  if (op === 'set' && (!novo || typeof novo !== 'object' || Array.isArray(novo))) return negar(400, 'Documento inválido.');

  // Primeiro acesso de uma base vazia: qualquer pessoa cria o primeiro administrador.
  if (!usuario) {
    if (col === 'usuarios' && op === 'set' && !haUsuarios && novo.perfil === 'admin' && novo.ativo !== false) return null;
    return negar(401, 'Entre com seu usuário para registrar alterações.');
  }
  const admin = usuario.perfil === 'admin';

  if (col === 'config') {
    if (op !== 'set') return negar(403, 'Configurações não podem ser removidas.');
    if (id === 'frotas') return null;
    if (id === 'opcoes' || id === 'areas') return admin ? null : negar(403, 'Só o administrador muda estas opções.');
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
  if (col === 'pecas') {
    const plan = usuario.perfil === 'planejador' || admin;
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
