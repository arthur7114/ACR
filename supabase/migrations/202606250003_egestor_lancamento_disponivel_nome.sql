-- Nome amigavel do disponivel (conta de origem) por lancamento, para exibir na
-- previa do eGestor (ex.: "Sicredi MMC - 06394-0"). Preenchido na geracao da
-- previa a partir da API do eGestor; nao vai no payload enviado.
alter table public.egestor_lancamentos
  add column if not exists disponivel_nome text;
