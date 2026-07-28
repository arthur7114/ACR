-- Lancamento manual na previa eGestor: linha adicionada pelo operador (ex.: IPTU
-- de outro imovel abatido em prestacao anterior) que NAO vem da analise do
-- documento. Marcada com origem_manual=true para sobreviver a regeneracao da
-- previa ("Gerar previa" apaga e recria apenas as linhas automaticas).
alter table public.egestor_lancamentos
  add column if not exists origem_manual boolean not null default false;
