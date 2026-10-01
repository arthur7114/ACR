-- Atraso recuperado de MAIS DE UM mes no mesmo fechamento.
--
-- `atrasos_competencia_origem` so guarda uma origem: com dois meses pagos de
-- uma vez ela fica nula (apontar um deles seria arbitrario), e nenhum dos dois
-- era dado como quitado. Joao Cordeiro 0002521 (flat B) paga sempre dois meses
-- atrasado: em jun/2026 quitou 04 e 05, em ago/2026 quitou 06 e 07. O mapa e o
-- risco por imovel seguiam mostrando julho em aberto, e o cliente apontou.
--
-- A lista traz cada origem com o valor que o documento atribui a ela, para o
-- hover nao precisar dividir o total no chute. So e gravada com DUAS ou mais
-- origens; com uma so continua valendo `atrasos_competencia_origem`.
--
-- Formato: [{"competencia": "2026-06-01", "valor": 787.96}, ...], ordenado,
-- toda origem anterior a `competencia`.
alter table public.imovel_competencias
  add column if not exists atrasos_origens jsonb;

alter table public.imovel_competencias
  drop constraint if exists imovel_competencias_atrasos_origens_array_check;

alter table public.imovel_competencias
  add constraint imovel_competencias_atrasos_origens_array_check
    check (atrasos_origens is null or jsonb_typeof(atrasos_origens) = 'array');

comment on column public.imovel_competencias.atrasos_origens is
  'Origens do atraso recuperado quando o mes quita duas ou mais competencias anteriores: [{competencia, valor}]. Nulo com origem unica (ver atrasos_competencia_origem) ou desconhecida.';
