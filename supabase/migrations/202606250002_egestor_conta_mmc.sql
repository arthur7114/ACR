-- Ajustes da conta eGestor MMC Participacoes (Maracanau), o unico empreendimento
-- que hoje sobe ao eGestor. Por decisao operacional, essa conta:
--   1. lanca SOMENTE o recebimento (comissoes/despesas sao conciliadas fora);
--   2. usa a etiqueta/prefixo "MMC" (no lugar de "ACR") nas tags e na descricao;
--   3. tem a conta de origem (disponivel) "Sicredi MMC - 06394 - 0" resolvida
--      pelo numero da conta (06394) via API do eGestor.
-- As colunas sao genericas/por conta para nao acoplar regra a um id fixo.

alter table public.egestor_contas
  add column if not exists tag_padrao text,
  add column if not exists somente_recebimento boolean not null default false,
  add column if not exists disponivel_busca text;

-- Conta Global mantem a etiqueta historica "ACR".
update public.egestor_contas
  set tag_padrao = 'ACR'
  where id = '00000000-0000-0000-0000-000000000001'::uuid
    and (tag_padrao is null or trim(tag_padrao) = '');

-- Conta MMC Participacoes: etiqueta MMC, somente recebimento e origem Sicredi.
-- Zera o cod_disponivel_padrao (estava 2 = "Planilha consolidada") para que o
-- sistema resolva "Sicredi MMC - 06394 - 0" pela API na proxima previa.
update public.egestor_contas
  set tag_padrao = 'MMC',
      somente_recebimento = true,
      disponivel_busca = '06394',
      cod_disponivel_padrao = null
  where id = '00000000-0000-0000-0000-000000000002'::uuid;
