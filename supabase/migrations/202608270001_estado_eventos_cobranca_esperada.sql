-- Sub-plano B (plano recebimentos-canonicos-v2): estado final x eventos e
-- cobranca esperada por componentes. Migration aditiva: nenhuma coluna ou
-- linha existente e alterada; snapshots antigos permanecem legiveis
-- (status em_rescisao historico continua valido no CHECK existente).

alter table public.imovel_competencias
  add column if not exists eventos jsonb not null default '[]'::jsonb,
  add column if not exists cobranca_esperada numeric;

comment on column public.imovel_competencias.eventos is
  'Eventos da competencia (rescisao, entrada, saida, pagamento_atrasado). Independentes do status_ocupacao, que passa a descrever apenas o estado no fim da competencia.';
comment on column public.imovel_competencias.cobranca_esperada is
  'Cobranca esperada da competencia por componentes com vigencia/evidencia (aluguel contratado + garagem contratada). Null = sem evidencia suficiente; nunca zero inventado.';

alter table public.imovel_vigencias
  add column if not exists garagem_contratada numeric;

comment on column public.imovel_vigencias.garagem_contratada is
  'Valor de garagem contratado na vigencia (CA-IND23). Null = sem evidencia documental; a cobranca esperada usa apenas o aluguel. Nunca inferido do cadastro atual.';
