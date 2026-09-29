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
      parada_id: 'ID', tag: 'TAG', frota: 'Frota', tipo: 'Tipo', area: 'Área', motivo: 'Motivo', observacao: 'Observação',
      inicio: 'Início', fim: 'Fim', duracao_h: 'Duração (h)', situacao: 'Situação', tecnico: 'Técnico',
      horimetro_inicio: 'Horímetro início', horimetro_fim: 'Horímetro fim', correcoes: 'Correções', aberta_por: 'Aberta por'
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
      tag: 'TAG', frota: 'Frota', tipo: 'Tipo', porte: 'Porte', modelo: 'Modelo', area: 'Área', ano: 'Ano', horimetro: 'Horímetro',
      horimetro_em: 'Leitura do horímetro', situacao_atual: 'Situação atual', situacao_desde: 'Desde', no_painel: 'No painel'
    }
  },
  eventos: {
    view: 'vw_eventos', ordem: 'data desc', filtroData: 'data',
    cols: { data: 'Data', tag: 'TAG', situacao: 'Situação', acao: 'Ação', por: 'Por', detalhe: 'Detalhe', horimetro: 'Horímetro' }
  },
  usuarios: {
    view: 'vw_usuarios', ordem: 'nome',
    cols: { matricula: 'Matrícula', nome: 'Nome', nome_curto: 'Nome curto', perfil: 'Perfil', ativo: 'Ativo' }
  }
};

// Tipos para o Power Query (colunas não listadas ficam como texto).
const TIPOS_M = {
  'Início': 'datetime', 'Fim': 'datetime', 'Data': 'datetime', 'Desde': 'datetime', 'Leitura do horímetro': 'datetime',
  'Duração (h)': 'number', 'Horímetro início': 'number', 'Horímetro fim': 'number', 'Horímetro': 'number',
  'Correções': 'Int64.Type', 'Ordem': 'Int64.Type', 'Ano': 'Int64.Type',
  'Parada cancelada': 'logical', 'No painel': 'logical', 'Ativo': 'logical'
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

async function csv(nome, { de, ate } = {}) {
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
  const linhas = [chaves.map(k => celula(t.cols[k])).join(',')];
  for (const row of r.rows) linhas.push(chaves.map((k, i) => celula(row['c' + i])).join(','));
  return '\uFEFF' + linhas.join('\r\n') + '\r\n';
}

function codigoM(nome, base, ch) {
  const t = TABELAS[nome];
  if (!t) return '';
  const tipos = Object.values(t.cols).filter(c => TIPOS_M[c]).map(c => `{"${c}", ${TIPOS_M[c].includes('.') ? TIPOS_M[c] : 'type ' + TIPOS_M[c]}}`);
  return `let
    Fonte = Csv.Document(
        Web.Contents("${base}", [RelativePath = "api/relatorios/${nome}.csv", Query = [chave = "${ch}"]]),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    Cabecalhos = Table.PromoteHeaders(Fonte, [PromoteAllScalars = true]),
    Tipos = Table.TransformColumnTypes(Cabecalhos, {${tipos.join(', ')}}, "en-US")
in
    Tipos`;
}

module.exports = { TABELAS, chave, iguais, csv, codigoM };
