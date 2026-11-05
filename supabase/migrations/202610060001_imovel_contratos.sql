-- Histórico de contratos de locação por imóvel: uma linha por contrato
-- declarado (datas exatas), do mais antigo ao vigente.
--
-- `imoveis.contrato_*` continua sendo o contrato vigente (a coluna "Contrato" e
-- o filtro de prazo da lista leem dali). Esta tabela guarda todos, inclusive os
-- que o vigente já substituiu. Como em 202610020001, não é `contratos_locacao`:
-- aquela tem grão de mês e alimenta os Indicadores; esta guarda o que o
-- contrato assinado declara e não entra em nenhum cálculo financeiro.
--
-- Um contrato por (imóvel, início): reaplicar o mesmo início corrige as datas,
-- o que torna a importação da planilha, a aprovação do relatório e o backfill
-- idempotentes.

create table if not exists public.imovel_contratos (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references public.imoveis(id) on delete cascade,
  locatario text,
  inicio date not null,
  termino date,
  fonte text,
  fechamento_id uuid references public.fechamentos(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint imovel_contratos_intervalo check (termino is null or termino >= inicio),
  constraint imovel_contratos_unico unique (imovel_id, inicio)
);

create index if not exists imovel_contratos_imovel_idx
  on public.imovel_contratos (imovel_id, inicio desc);

alter table public.imovel_contratos enable row level security;

comment on table public.imovel_contratos is 'Contratos de locação declarados por imóvel (planilha, relatório de vigência, cadastro manual), com datas exatas. O vigente também vive em imoveis.contrato_*.';
comment on column public.imovel_contratos.fonte is 'De onde vieram as datas: planilha, relatório de vigência (com competência), cadastro manual ou auditoria.';

-- Backfill 1: o vigente de cada imóvel que já tem início.
insert into public.imovel_contratos (imovel_id, locatario, inicio, termino, fonte)
select id, contrato_locatario, contrato_inicio, contrato_termino, coalesce(contrato_fonte, 'Cadastro')
from public.imoveis
where contrato_inicio is not null
on conflict (imovel_id, inicio) do nothing;

-- Backfill 2: contratos que um relatório de vigência já substituiu. A
-- aprovação grava o prazo anterior em `auditoria_correcoes` como texto
-- "dd/mm/aa a dd/mm/aa (LOCATÁRIO)"; só o que casa com esse formato é
-- recuperado, o resto fica de fora.
with antigos as (
  select
    a.fechamento_id,
    substring(a.campo_alterado from '^imoveis\.contrato\[(.*)\]$') as unidade,
    regexp_match(a.valor_anterior, '^(\d{2}/\d{2}/\d{2}) a (—|\d{2}/\d{2}/\d{2})(?: \((.*)\))?$') as m
  from public.auditoria_correcoes a
  where a.campo_alterado like 'imoveis.contrato[%'
)
insert into public.imovel_contratos (imovel_id, locatario, inicio, termino, fonte, fechamento_id)
select
  i.id,
  nullif(trim(antigos.m[3]), ''),
  to_date(antigos.m[1], 'DD/MM/YY'),
  case when antigos.m[2] = '—' then null else to_date(antigos.m[2], 'DD/MM/YY') end,
  'Auditoria (substituído por relatório de vigência)',
  antigos.fechamento_id
from antigos
join public.fechamentos f on f.id = antigos.fechamento_id
join public.imoveis i
  on i.empreendimento_id = f.empreendimento_id
 and i.imobiliaria_id = f.imobiliaria_id
 and i.unidade = antigos.unidade
where antigos.m is not null
  and to_date(antigos.m[1], 'DD/MM/YY') < i.contrato_inicio
on conflict (imovel_id, inicio) do nothing;
