-- Nivel 2 do historico por imovel: acordos parcelados + baixa de parcelas.
-- Persiste os acordos/rescisoes parcelados detectados nas prestacoes e permite
-- dar baixa (manual ou automatica) em cada parcela recebida.

create table if not exists public.acordos (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid references public.imobiliarias(id) on delete cascade,
  empreendimento_id uuid not null references public.empreendimentos(id) on delete cascade,
  imovel_id uuid references public.imoveis(id) on delete set null,
  unidade text not null,
  inquilino text,
  tipo text not null default 'acordo',
  descricao text,
  valor_total numeric(14,2),
  valor_parcela numeric(14,2),
  total_parcelas integer,
  status text not null default 'aberto',
  primeira_competencia date,
  observacao text,
  chave text not null unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint acordos_tipo_check check (tipo in ('acordo', 'rescisao')),
  constraint acordos_status_check check (status in ('aberto', 'quitado', 'cancelado'))
);

create table if not exists public.acordo_parcelas (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  numero integer not null,
  valor numeric(14,2),
  status text not null default 'pendente',
  competencia_pagamento date,
  fechamento_id uuid references public.fechamentos(id) on delete set null,
  origem text not null default 'derivado',
  baixado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint acordo_parcelas_status_check check (status in ('pendente', 'pago')),
  constraint acordo_parcelas_origem_check check (origem in ('derivado', 'manual')),
  constraint acordo_parcelas_unq unique (acordo_id, numero)
);

create index if not exists idx_acordos_emp_unidade on public.acordos (empreendimento_id, unidade);
create index if not exists idx_acordo_parcelas_acordo on public.acordo_parcelas (acordo_id);

drop trigger if exists set_acordos_atualizado_em on public.acordos;
create trigger set_acordos_atualizado_em
  before update on public.acordos
  for each row execute function public.set_atualizado_em();
