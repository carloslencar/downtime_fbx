# Relatórios: Excel (Power Query) e Power BI

## Opção recomendada: links de relatório (sem instalar nada)

O servidor publica cada tabela como CSV. O Excel busca na hora, e **Dados › Atualizar Tudo** traz
os dados novos.

1. Entre como administrador e abra a aba **Dados**.
2. Em **Conectar no Excel (Power Query)**, escolha a tabela e clique em **Copiar código**.
3. No Excel: *Dados › Obter Dados › De Outras Fontes › Consulta Nula*, depois *Editor Avançado*.
   Apague o conteúdo, cole o código e clique em Concluído.
4. Se o Excel perguntar como acessar o conteúdo da Web, escolha **Anônimo** e o nível do endereço do servidor.
5. Repita para as outras tabelas. Relacione as tabelas pelo campo `ID` / `Parada` e pela `TAG`.

| Tabela | Uma linha por | Campos principais |
|--------|---------------|-------------------|
| Paradas | parada | ID, Nº, TAG, Frota, Tipo, Área, Motivo, Início, Fim, Duração (h), Situação, Técnico, Horímetros |
| Etapas | etapa de cada parada | Parada, TAG, Etapa (aguardando, em manutenção, peças solicitadas, liberado), Início, Fim, Duração (h) |
| Correções | correção ou cancelamento | Parada, Data, Por, Campo, De, Para, Justificativa |
| Peças | peça solicitada | Parada nº, TAG, Peça, Código, Quantidade, Solicitada em/por, Ordem de compra, Chegou em, Espera (h), Situação |
| Equipamentos | equipamento | TAG, Frota, Tipo, Porte, Modelo, Área, Ano, Horímetro, Situação atual |
| Eventos | lançamento (histórico completo) | Data, TAG, Situação, Ação, Por, Detalhe, Horímetro |
| Usuários | usuário | Matrícula, Nome, Perfil, Ativo (nunca o PIN) |

Datas no fuso do `.env` (`TZ`). Para filtrar período direto no link, acrescente `&de=2026-09-01&ate=2026-09-30`.

### Chave de acesso

Os links levam uma chave (`?chave=...`). Quem tiver a chave consegue ler os relatórios, então
compartilhe só com quem monta os relatórios. Para trocar: botão **Gerar nova chave** na aba Dados
(as consultas antigas param de funcionar e precisam do código novo), ou defina `RELATORIOS_CHAVE` no `.env`.

## Opção avançada: conexão direta ao banco (Power BI / Power Query PostgreSQL)

Para quem prefere SQL. Exige abrir a porta do banco na rede.

1. No `.env`, defina `POWERQUERY_SENHA=uma-senha-forte`.
2. No `docker-compose.yml`, descomente em `db` as linhas `ports: - "5432:5432"`.
3. `docker compose up -d`
4. Conecte com servidor `IP-DO-SERVIDOR:5432`, banco `downtime`, usuário `relatorios` (ou `POWERQUERY_USUARIO`).
   No Excel, o conector PostgreSQL pode pedir a instalação do driver Npgsql; no Power BI já vem pronto.

Esse usuário só lê as views (não enxerga PINs nem tabelas internas):

| View | Conteúdo |
|------|----------|
| `vw_paradas` | paradas com frota, tipo, área, duração e situação |
| `vw_etapas` | cada etapa de cada parada, com início, fim e duração |
| `vw_correcoes` | correções e cancelamentos com justificativa |
| `vw_pecas` | peças solicitadas, ordem de compra, chegada e tempo de espera |
| `vw_equipamentos` | cadastro e situação atual |
| `vw_eventos` | todos os eventos lançados (histórico completo) |
| `vw_usuarios` | usuários sem PIN |
| `vw_frotas` | frotas cadastradas |

Exemplo, tempo médio de parada por frota no mês:

```sql
select frota, count(*) as paradas, round(avg(duracao_h), 1) as media_h
from vw_paradas
where situacao = 'Encerrada' and inicio >= date_trunc('month', now())
group by frota order by media_h desc;
```

## Planilha avulsa

A aba **Dados** continua com **Baixar planilha Excel (.xlsx)** e **CSV**, para mandar por e-mail.
