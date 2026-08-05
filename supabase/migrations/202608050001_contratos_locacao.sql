-- Entidades de domínio dos indicadores (D1, D10, D11, D12, D14, D16).
-- Contrato de locação é a fonte de "aluguel contratado"; imóvel sem contrato
-- vigente está vago. Valores vivem em linha do tempo própria (reajustes).
-- Lançamentos carregam duas datas (competência de origem e de recebimento).

create table if not exists public.contratos_locacao (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references public.imoveis(id) on delete cascade,
  locatario_nome text not null,
  inicio date not null,
  fim date,
  origem text not null default 'backfill'
    check (origem in ('backfill', 'fechamento', 'manual')),
  ativo boolean not null default true,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint contratos_locacao_inicio_dia1 check (extract(day from inicio) = 1),
  constraint contratos_locacao_fim_dia1
    check (fim is null or extract(day from fim) = 1),
  constraint contratos_locacao_intervalo check (fim is null or fim >= inicio),
  -- D16: um contrato vigente por imóvel por vez. Escopado a `ativo` para que
  -- um contrato lançado por engano possa ser desativado sem bloquear
  -- permanentemente a reutilização daquele intervalo de datas.
  constraint contratos_locacao_sem_sobreposicao
    exclude using gist (
      imovel_id with =,
      daterange(inicio, coalesce(fim + 1, 'infinity'::date), '[)') with &&
    ) where (ativo)
);

create index if not exists contratos_locacao_imovel_idx
  on public.contratos_locacao (imovel_id, inicio, fim);

-- D10: o valor contratado é uma linha do tempo dentro do contrato.
create table if not exists public.contrato_valores (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos_locacao(id) on delete cascade,
  vigencia_inicio date not null,
  valor numeric(14,2) not null check (valor >= 0),
  -- D11: o sistema declara o que sabe e o que chutou.
  origem text not null check (origem in ('inferido', 'confirmado')),
  fonte text,
  criado_em timestamptz not null default now(),
  constraint contrato_valores_dia1 check (extract(day from vigencia_inicio) = 1),
  constraint contrato_valores_unico unique (contrato_id, vigencia_inicio)
);

-- D12/D14/D20: fato financeiro por imóvel × competência × rubrica, com contrato.
create table if not exists public.lancamentos_competencia (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references public.imoveis(id) on delete cascade,
  contrato_id uuid references public.contratos_locacao(id) on delete set null,
  fechamento_id uuid references public.fechamentos(id) on delete set null,
  rubrica text not null check (rubrica in (
    'aluguel', 'garagem', 'agua', 'iptu', 'seguro', 'desconto',
    'multa_rescisao', 'acordo', 'outros'
  )),
  valor numeric(14,2) not null,
  competencia_origem date not null,
  competencia_recebimento date,
  situacao text not null check (situacao in ('recebido', 'em_aberto')),
  descricao text,
  origem text not null default 'backfill'
    check (origem in ('backfill', 'fechamento', 'manual')),
  criado_em timestamptz not null default now(),
  constraint lancamentos_origem_dia1 check (extract(day from competencia_origem) = 1),
  constraint lancamentos_receb_dia1
    check (competencia_recebimento is null or extract(day from competencia_recebimento) = 1),
  -- recebido tem data de recebimento; em aberto não tem.
  constraint lancamentos_situacao_coerente check (
    (situacao = 'recebido' and competencia_recebimento is not null)
    or (situacao = 'em_aberto' and competencia_recebimento is null)
  )
);

create index if not exists lancamentos_imovel_origem_idx
  on public.lancamentos_competencia (imovel_id, competencia_origem);
create index if not exists lancamentos_recebimento_idx
  on public.lancamentos_competencia (competencia_recebimento)
  where competencia_recebimento is not null;
create index if not exists lancamentos_contrato_idx
  on public.lancamentos_competencia (contrato_id)
  where contrato_id is not null;

drop trigger if exists set_contratos_locacao_atualizado_em on public.contratos_locacao;
create trigger set_contratos_locacao_atualizado_em
before update on public.contratos_locacao
for each row execute function public.set_atualizado_em();

alter table public.contratos_locacao enable row level security;
alter table public.contrato_valores enable row level security;
alter table public.lancamentos_competencia enable row level security;

do $$
declare t text;
begin
  foreach t in array array['contratos_locacao', 'contrato_valores', 'lancamentos_competencia']
  loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all privileges on table public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all privileges on table public.%I from authenticated', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant all privileges on table public.%I to service_role', t);
    end if;
  end loop;
end
$$;
