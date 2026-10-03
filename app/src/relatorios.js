'use strict';
const crypto = require('crypto');
const { pool, meta } = require('./db');
const config = require('./config');

// Tabelas publicadas como CSV para o Power Query ("De Web").
// Cabeçalhos iguais aos da planilha exportada pela tela Dados.
const TABELAS = {
  paradas: {
    view: 'vw_paradas', ordem: 'inicio desc', filtroData: 'inicio',
    cols: {
      parada_id: 'ID', numero: 'Nº', tag: 'TAG', oficina: 'Oficina', frota: 'Frota', tipo: 'Tipo', area: 'Área', motivo: 'Motivo', observacao: 'Observação',
      inicio: 'Início', fim: 'Fim', duracao_h: 'Duração (h)', situacao: 'Situação', tecnico: 'Técnico',
      horimetro_inicio: 'Horímetro início', horimetro_fim: 'Horímetro fim', correcoes: 'Correções', aberta_por: 'Aberta por',
      responsaveis: 'Responsáveis', transferencias: 'Transferências', tipo_parada: 'Tipo de parada', preventiva: 'Preventiva'
    }
  },
  etapas: {
    view: 'vw_etapas', ordem: 'inicio desc', filtroData: 'inicio',
    cols: {
      parada_id: 'Parada', tag: 'TAG', ordem: 'Ordem', etapa: 'Etapa', inicio: 'Início', fim: 'Fim', duracao_h: 'Duração (h)',
      registrado_por: 'Registrado por', parada_cancelada: 'Parada cancelada'
    }
  },
  correcoes: {
    view: 'vw_correcoes', ordem: 'data desc', filtroData: 'data',
    cols: { parada_id: 'Parada', tag: 'TAG', data: 'Data', por: 'Por', campo: 'Campo', de: 'De', para: 'Para', justificativa: 'Justificativa' }
  },
  equipamentos: {
    view: 'vw_equipamentos', ordem: 'tag',
    cols: {
      tag: 'TAG', oficina: 'Oficina', frota: 'Frota', tipo: 'Tipo', porte: 'Porte', modelo: 'Modelo', area: 'Área', ano: 'Ano', horimetro: 'Horímetro',
      horimetro_em: 'Leitura do horímetro', media_h_dia: 'Média (h/dia)', situacao_atual: 'Situação atual', situacao_desde: 'Desde', no_painel: 'No painel'
    }
  },
  eventos: {
    view: 'vw_eventos', ordem: 'data desc', filtroData: 'data',
    cols: { data: 'Data', tag: 'TAG', situacao: 'Situação', acao: 'Ação', por: 'Por', detalhe: 'Detalhe', horimetro: 'Horímetro' }
  },
  pecas: {
    view: 'vw_pecas', ordem: 'solicitada_em desc', filtroData: 'solicitada_em',
    cols: {
      parada_numero: 'Parada nº', parada_id: 'Parada', tag: 'TAG', frota: 'Frota', descricao: 'Peça', codigo: 'Código',
      quantidade: 'Quantidade', solicitada_em: 'Solicitada em', solicitada_por: 'Solicitada por', ordem_compra: 'Ordem de compra',
      ordem_compra_em: 'OC informada em', chegou: 'Chegou', chegou_em: 'Chegou em', recebida_por: 'Recebida por',
      espera_h: 'Espera (h)', situacao: 'Situação'
    }
  },
  leituras: {
    view: 'vw_leituras', ordem: 'coletada_em desc', filtroData: 'coletada_em',
    cols: { tag: 'TAG', oficina: 'Oficina', frota: 'Frota', horimetro: 'Horímetro', coletada_em: 'Coletada em', lancada_em: 'Lançada em', lancada_por: 'Lançada por', origem: 'Origem' }
  },
  preventivas: {
    view: 'vw_preventivas', ordem: 'data desc', filtroData: 'data',
    cols: { tag: 'TAG', oficina: 'Oficina', frota: 'Frota', preventiva: 'Preventiva', horimetro_previsto: 'Horímetro previsto', horimetro: 'Horímetro', data: 'Data', parada_numero: 'Parada nº', origem: 'Origem', registrado_por: 'Registrado por' }
  },
  agendadas: {
    view: 'vw_preventivas_agendadas', ordem: 'faltam_h',
    cols: { tag: 'TAG', oficina: 'Oficina', frota: 'Frota', preventiva: 'Preventiva', horimetro_previsto: 'Horímetro previsto', horimetro_atual: 'Horímetro atual', faltam_h: 'Faltam (h)' }
  },
  usuarios: {
    view: 'vw_usuarios', ordem: 'nome',
    cols: { matricula: 'Matrícula', nome: 'Nome', nome_curto: 'Nome curto', perfil: 'Perfil', oficina: 'Oficina', ativo: 'Ativo' }
  }
};

// Inglês (?idioma=en): nomes das colunas e valores fixos do sistema. Texto digitado (observações, nomes) fica como está.
const COLS_EN = {
  'ID': 'ID', 'Nº': 'No.', 'TAG': 'Tag', 'Oficina': 'Workshop', 'Frota': 'Fleet', 'Tipo': 'Type', 'Área': 'Area', 'Motivo': 'Reason',
  'Observação': 'Note', 'Início': 'Start', 'Fim': 'End', 'Duração (h)': 'Duration (h)', 'Situação': 'Status', 'Técnico': 'Technician',
  'Horímetro início': 'Hour meter start', 'Horímetro fim': 'Hour meter end', 'Correções': 'Corrections', 'Aberta por': 'Opened by',
  'Responsáveis': 'Technicians', 'Transferências': 'Transfers', 'Tipo de parada': 'Stop type', 'Preventiva': 'Preventive',
  'Parada': 'Stop', 'Ordem': 'Order', 'Etapa': 'Stage', 'Registrado por': 'Recorded by', 'Parada cancelada': 'Stop cancelled',
  'Data': 'Date', 'Por': 'By', 'Campo': 'Field', 'De': 'From', 'Para': 'To', 'Justificativa': 'Justification',
  'Porte': 'Size', 'Modelo': 'Model', 'Ano': 'Year', 'Horímetro': 'Hour meter', 'Leitura do horímetro': 'Hour meter read at',
  'Média (h/dia)': 'Average (h/day)', 'Situação atual': 'Current status', 'Desde': 'Since', 'No painel': 'On board',
  'Ação': 'Action', 'Detalhe': 'Detail', 'Parada nº': 'Stop no.', 'Peça': 'Part', 'Código': 'Code', 'Quantidade': 'Quantity',
  'Solicitada em': 'Requested at', 'Solicitada por': 'Requested by', 'Ordem de compra': 'Purchase order', 'OC informada em': 'PO entered at',
  'Chegou': 'Arrived', 'Chegou em': 'Arrived at', 'Recebida por': 'Received by', 'Espera (h)': 'Wait (h)',
  'Coletada em': 'Collected at', 'Lançada em': 'Entered at', 'Lançada por': 'Entered by', 'Origem': 'Source',
  'Horímetro previsto': 'Due hour meter', 'Horímetro atual': 'Current hour meter', 'Faltam (h)': 'Remaining (h)',
  'Matrícula': 'Employee ID', 'Nome': 'Name', 'Nome curto': 'Short name', 'Perfil': 'Role', 'Ativo': 'Active'
};
const VAL_EN = {
  'Encerrada': 'Closed', 'Em andamento': 'In progress', 'Cancelada': 'Cancelled', 'Corretiva': 'Corrective', 'Preventiva': 'Preventive',
  'Operando': 'Operating', 'Aguardando manutenção': 'Waiting for maintenance', 'Em manutenção': 'In maintenance', 'Peças solicitadas': 'Parts requested',
  'Aguardando peças': 'Waiting for parts', 'Peças recebidas': 'Parts received', 'Liberado · aguardando operação': 'Released · waiting for operations', 'Correção': 'Correction',
  'Caminhão articulado': 'Articulated truck', 'Escavadeira': 'Excavator', 'Pá carregadeira': 'Wheel loader', 'Trator de esteira': 'Dozer',
  'Motoniveladora': 'Motor grader', 'Bomba': 'Pump', 'Perfuratriz': 'Drill rig', 'Caminhão comboio': 'Fuel truck',
  'Operação': 'Operations', 'Manutenção': 'Maintenance', 'Planejamento': 'Planning', 'Administrador': 'Administrator',
  'Mecânica': 'Mechanical', 'Hidráulica': 'Hydraulic', 'Elétrica': 'Electrical', 'Pneu / rodante': 'Tires / undercarriage', 'Avaria / acidente': 'Damage / accident', 'Outro': 'Other',
  'Chegou': 'Arrived', 'Com ordem de compra': 'With purchase order', 'Aguardando ordem de compra': 'Waiting for purchase order',
  'Lançamento diário': 'Daily entry', 'Parada': 'Stop', 'Cadastro': 'Equipment register', 'Leitura inicial': 'Initial reading',
  'Parada liberada': 'Stop released', 'Marcada pelo planejamento': 'Marked by planning',
  'Parada aberta': 'Stop opened', 'Atendimento iniciado': 'Work started', 'Ordens de compra lançadas': 'Purchase orders entered',
  'Liberado pela manutenção': 'Released by maintenance', 'Recebido pela operação': 'Received by operations', 'Atendimento retomado': 'Work resumed',
  'Lançamento desfeito': 'Entry undone', 'Lançamento corrigido': 'Entry corrected', 'Parada corrigida': 'Stop corrected', 'Parada cancelada': 'Stop cancelled',
  'Atendimento transferido': 'Work transferred', 'Peças adicionadas': 'Parts added', 'Solicitação de peças cancelada': 'Parts request cancelled'
};
// Colunas cujos valores são do sistema (traduzidos); as demais são dados digitados.
const TRADUZ = new Set(['situacao', 'tipo', 'motivo', 'tipo_parada', 'etapa', 'situacao_atual', 'acao', 'perfil', 'origem']);
function rotulo(pt, idioma) { return idioma === 'en' ? (COLS_EN[pt] || pt) : pt; }

// Tipos para o Power Query (colunas não listadas ficam como texto).
const TIPOS_M = {
  'Início': 'datetime', 'Fim': 'datetime', 'Data': 'datetime', 'Desde': 'datetime', 'Leitura do horímetro': 'datetime',
  'Duração (h)': 'number', 'Horímetro início': 'number', 'Horímetro fim': 'number', 'Horímetro': 'number',
  'Correções': 'Int64.Type', 'Ordem': 'Int64.Type', 'Ano': 'Int64.Type',
  'Parada cancelada': 'logical', 'No painel': 'logical', 'Ativo': 'logical',
  'Nº': 'Int64.Type', 'Transferências': 'Int64.Type', 'Parada nº': 'Int64.Type', 'Quantidade': 'number', 'Solicitada em': 'datetime', 'OC informada em': 'datetime',
  'Chegou em': 'datetime', 'Chegou': 'logical', 'Espera (h)': 'number', 'Média (h/dia)': 'number', 'Coletada em': 'datetime', 'Horímetro previsto': 'number', 'Horímetro atual': 'number', 'Faltam (h)': 'number', 'Lançada em': 'datetime'
};

async function chave() {
  if (config.relatoriosChave) return config.relatoriosChave;
  return meta('relatorios_chave', crypto.randomBytes(18).toString('base64url'));
}

function iguais(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function celula(v) {
  if (v == null) return '';
  let s;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'boolean') s = v ? 'true' : 'false';
  else s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function diaValido(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; }

async function csv(nome, { de, ate, idioma } = {}) {
  const en = idioma === 'en';
  const t = TABELAS[nome];
  if (!t) return null;
  const chaves = Object.keys(t.cols);
  const params = [];
  let where = '';
  if (t.filtroData) {
    const f = [];
    if (diaValido(de)) { params.push(de); f.push(`v.${t.filtroData} >= $${params.length}::date`); }
    if (diaValido(ate)) { params.push(ate); f.push(`v.${t.filtroData} < $${params.length}::date + 1`); }
    if (f.length) where = ' where ' + f.join(' and ');
  }
  // Datas em texto ISO local (sem fuso), que o Power Query reconhece como data/hora.
  const sel = chaves.map((k, i) => `to_json(v.${k}) as c${i}`).join(', ');
  const r = await pool.query(`select ${sel} from ${t.view} v${where} order by v.${t.ordem}`, params);
  const linhas = [chaves.map(k => celula(rotulo(t.cols[k], idioma))).join(',')];
  for (const row of r.rows) linhas.push(chaves.map((k, i) => {
    let v = row['c' + i];
    if (en && typeof v === 'string' && TRADUZ.has(k) && VAL_EN[v]) v = VAL_EN[v];
    return celula(v);
  }).join(','));
  return '\uFEFF' + linhas.join('\r\n') + '\r\n';
}

function codigoM(nome, base, ch, idioma) {
  const t = TABELAS[nome];
  if (!t) return '';
  const en = idioma === 'en';
  const tipos = Object.values(t.cols).filter(c => TIPOS_M[c]).map(c => `{"${rotulo(c, idioma)}", ${TIPOS_M[c].includes('.') ? TIPOS_M[c] : 'type ' + TIPOS_M[c]}}`);
  return `let
    ${en ? 'Source' : 'Fonte'} = Csv.Document(
        Web.Contents("${base}", [RelativePath = "api/relatorios/${nome}.csv", Query = [chave = "${ch}"${en ? ', idioma = "en"' : ''}]]),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    ${en ? 'Headers' : 'Cabecalhos'} = Table.PromoteHeaders(${en ? 'Source' : 'Fonte'}, [PromoteAllScalars = true]),
    ${en ? 'Types' : 'Tipos'} = Table.TransformColumnTypes(${en ? 'Headers' : 'Cabecalhos'}, {${tipos.join(', ')}}, "en-US")
in
    ${en ? 'Types' : 'Tipos'}`;
}

module.exports = { TABELAS, chave, iguais, csv, codigoM };
