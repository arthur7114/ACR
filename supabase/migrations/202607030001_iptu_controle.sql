-- Controle de pagamento de IPTU: registro passivo de parcelas quitadas por
-- apartamento (importado de certidao mensal da imobiliaria), usado para
-- identificar quais parcelas caem em periodo de vacancia (responsabilidade
-- do proprietario). Nao gera lancamento no eGestor.

insert into storage.buckets (id, name, public)
values ('iptu-certidoes', 'iptu-certidoes', false)
on conflict (id) do nothing;

create table if not exists public.iptu_carnes (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references public.imoveis(id) on delete cascade,
  ano_referencia integer not null,
  numero_parcelas integer not null default 10,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint iptu_carnes_unq unique (imovel_id, ano_referencia)
);

create table if not exists public.iptu_importacoes (
  id uuid primary key default gen_random_uuid(),
  empreendimento_id uuid not null references public.empreendimentos(id) on delete cascade,
  arquivo_nome text not null,
  arquivo_path text not null,
  competencia_relatorio text not null,
  resultado_bruto jsonb not null default '{}'::jsonb,
  apartamentos_nao_vinculados jsonb not null default '[]'::jsonb,
  anomalias jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.iptu_parcelas (
  id uuid primary key default gen_random_uuid(),
  carne_id uuid not null references public.iptu_carnes(id) on delete cascade,
  numero integer not null,
  pago boolean not null default false,
  responsavel text,
  status_imovel_no_registro text,
  origem_importacao_id uuid references public.iptu_importacoes(id) on delete set null,
  registrado_em timestamptz,
  constraint iptu_parcelas_responsavel_check check (responsavel in ('inquilino', 'proprietario')),
  constraint iptu_parcelas_unq unique (carne_id, numero)
);

create index if not exists idx_iptu_carnes_imovel on public.iptu_carnes (imovel_id);
create index if not exists idx_iptu_parcelas_carne on public.iptu_parcelas (carne_id);
create index if not exists idx_iptu_importacoes_empreendimento on public.iptu_importacoes (empreendimento_id);

drop trigger if exists set_iptu_carnes_atualizado_em on public.iptu_carnes;
create trigger set_iptu_carnes_atualizado_em
before update on public.iptu_carnes
for each row execute function public.set_atualizado_em();
