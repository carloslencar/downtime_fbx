'use strict';
// Configuração lida das variáveis de ambiente (arquivo .env do docker compose).
const env = process.env;

module.exports = {
  porta: Number(env.PORT || 3000),
  // Sem DATABASE_URL, a conexão usa PGHOST, PGUSER, PGPASSWORD e PGDATABASE (padrão do docker compose).
  databaseUrl: env.DATABASE_URL || '',
  tz: env.TZ || 'America/Manaus',
  // "prototipo" importa os dados do protótipo na primeira inicialização; "vazio" começa sem nada.
  dadosIniciais: (env.DADOS_INICIAIS || 'prototipo').toLowerCase(),
  // Recuperação de acesso: define o PIN do administrador na inicialização.
  adminPin: env.ADMIN_PIN || '',
  adminMatricula: env.ADMIN_MATRICULA || '10001',
  // Usuário somente leitura do banco para Power Query / Power BI (opcional).
  pqUsuario: env.POWERQUERY_USUARIO || 'relatorios',
  pqSenha: env.POWERQUERY_SENHA || '',
  // Chave dos links de relatório (CSV). Em branco, o sistema gera uma e guarda no banco.
  relatoriosChave: env.RELATORIOS_CHAVE || '',
  publicDir: env.PUBLIC_DIR || require('path').join(__dirname, '..', 'public'),
  seedArquivo: env.SEED_ARQUIVO || require('path').join(__dirname, '..', 'seed', 'prototipo.json')
};
