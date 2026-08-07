-- Atraso recuperado vindo de acordo não informa o mês de origem. Antes o
-- backfill gravava a competência corrente nesse caso, o que afirmava duas
-- coisas incompatíveis na mesma linha ("isto é atraso" e "originou-se neste
-- mês") e fazia o valor ser lido como aluguel do próprio mês, desaparecendo da
-- recuperação de atrasados.
--
-- Nulo passa a significar: pertence a competência anterior, mês não informado.
-- Com isso a partição do aluguel recebido no mês fica exaustiva e sem caso
-- especial — origem igual à competência é aluguel do mês, origem diferente
-- (anterior ou nula) é recuperação.

alter table public.lancamentos_competencia
  alter column competencia_origem drop not null;

-- Nulo é permitido, mas nunca pode ser igual ao recebimento disfarçado: se a
-- origem é conhecida, ela não pode ser posterior ao mês em que o dinheiro
-- entrou.
alter table public.lancamentos_competencia
  drop constraint if exists lancamentos_competencia_origem_nao_posterior_check;

alter table public.lancamentos_competencia
  add constraint lancamentos_competencia_origem_nao_posterior_check
    check (
      competencia_origem is null
      or competencia_recebimento is null
      or competencia_origem <= competencia_recebimento
    );

comment on column public.lancamentos_competencia.competencia_origem is
  'Competência a que o valor pertence. Nulo = anterior ao recebimento, mês não informado (típico de atraso vindo de acordo).';
