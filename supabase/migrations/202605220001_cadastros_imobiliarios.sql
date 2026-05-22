alter table public.imobiliarias
add column if not exists email text,
add column if not exists telefone text,
add column if not exists tolerancia_repasse_reais numeric(14,2) not null default 0.10,
add column if not exists janela_antes_dias integer not null default 15,
add column if not exists janela_depois_dias integer not null default 45,
add column if not exists egestor_tag_id text,
add column if not exists observacoes text,
add column if not exists atualizado_em timestamptz not null default now();

alter table public.empreendimentos
add column if not exists codigo text,
add column if not exists endereco text,
add column if not exists egestor_tag_id text,
add column if not exists atualizado_em timestamptz not null default now();

create table if not exists public.imoveis (
  id uuid primary key default gen_random_uuid(),
  empreendimento_id uuid not null references public.empreendimentos(id),
  imobiliaria_id uuid not null references public.imobiliarias(id),
  codigo_imobiliaria text not null,
  unidade text not null,
  tipo text,
  inquilino_nome text,
  status text not null default 'ocupado',
  valor_aluguel_esperado numeric(14,2),
  taxa_administracao_percent numeric(7,4),
  ativo boolean not null default true,
  egestor_tag_id text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint imoveis_status_check check (status in ('ocupado', 'vago', 'inadimplente', 'em_rescisao', 'em_negociacao', 'inativo')),
  constraint imoveis_codigo_unique unique (imobiliaria_id, empreendimento_id, codigo_imobiliaria),
  constraint imoveis_unidade_unique unique (imobiliaria_id, empreendimento_id, unidade)
);

alter table public.movimentacoes
add column if not exists imovel_id uuid references public.imoveis(id) on delete set null;

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists set_imobiliarias_atualizado_em on public.imobiliarias;
create trigger set_imobiliarias_atualizado_em
before update on public.imobiliarias
for each row execute function public.set_atualizado_em();

drop trigger if exists set_empreendimentos_atualizado_em on public.empreendimentos;
create trigger set_empreendimentos_atualizado_em
before update on public.empreendimentos
for each row execute function public.set_atualizado_em();

drop trigger if exists set_imoveis_atualizado_em on public.imoveis;
create trigger set_imoveis_atualizado_em
before update on public.imoveis
for each row execute function public.set_atualizado_em();

create index if not exists imoveis_imobiliaria_idx on public.imoveis (imobiliaria_id);
create index if not exists imoveis_empreendimento_idx on public.imoveis (empreendimento_id);
create index if not exists imoveis_status_idx on public.imoveis (status);

insert into public.imobiliarias (nome, layout, ativo, tolerancia_repasse_reais, janela_antes_dias, janela_depois_dias)
values
  ('Cesar Rego', 'cesar_rego', true, 0.10, 15, 45),
  ('Plural Imobiliaria', 'plural', true, 0.10, 15, 45)
on conflict (nome) do nothing;

insert into public.empreendimentos (nome, codigo, descricao, ativo)
values
  ('Apartamento Jose de Alencar', 'JOSE_ALENCAR', 'Cadastro inicial previsto no mock.', true),
  ('Galpao Jose Walter', 'JOSE_WALTER', 'Cadastro inicial previsto no mock.', true)
on conflict (nome) do nothing;
