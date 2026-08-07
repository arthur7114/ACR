-- O mês de origem do atraso recuperado já vem na fonte: o acordo traz
-- `competencia_original` (ex.: "05/2026") e a linha de competência anterior traz
-- a sua. Essa informação era descartada na materialização, e o atraso nascia sem
-- origem — indistinguível do aluguel do próprio mês.
--
-- Campo separado de `competencia_original` de propósito: aquele descreve o
-- ALUGUEL da linha (que é do mês corrente), este descreve o ATRASO (que é de um
-- mês anterior). Reaproveitar um só campo para os dois foi exatamente o que
-- fazia o atraso ser lido como aluguel da competência.
--
-- Nulo = origem não informada, ou atrasos de meses diferentes somados num valor
-- único (apontar um deles seria arbitrário).

alter table public.imovel_competencias
  add column if not exists atrasos_competencia_origem date;

-- Atraso é sempre de mês anterior: a origem nunca pode ser a própria competência
-- nem posterior a ela.
alter table public.imovel_competencias
  drop constraint if exists imovel_competencias_atraso_origem_anterior_check;

alter table public.imovel_competencias
  add constraint imovel_competencias_atraso_origem_anterior_check
    check (
      atrasos_competencia_origem is null
      or atrasos_competencia_origem < competencia
    );

comment on column public.imovel_competencias.atrasos_competencia_origem is
  'Competência de origem do atraso recuperado no mês, quando única e conhecida. Nulo = não informada ou atrasos de meses diferentes.';
