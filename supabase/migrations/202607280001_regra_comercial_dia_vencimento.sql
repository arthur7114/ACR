-- Dia de vencimento padrao por regra comercial (imobiliaria x empreendimento).
-- Usado para calcular o vencimento do lancamento no eGestor quando NAO ha
-- comprovante de pagamento (pagamento feito pela imobiliaria): o vencimento cai
-- no mes seguinte a competencia, neste dia. Null = mantem a competencia.
alter table public.regras_comerciais
  add column if not exists dia_vencimento_padrao smallint;

alter table public.regras_comerciais
  drop constraint if exists regras_comerciais_dia_vencimento_check;
alter table public.regras_comerciais
  add constraint regras_comerciais_dia_vencimento_check
  check (dia_vencimento_padrao is null or (dia_vencimento_padrao between 1 and 31));

comment on column public.regras_comerciais.dia_vencimento_padrao is
  'Dia do vencimento do repasse no mes seguinte a competencia quando nao ha comprovante. Null = usa a competencia.';
