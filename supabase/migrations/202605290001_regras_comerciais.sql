create table if not exists public.regras_comerciais (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
  empreendimento_id uuid not null references public.empreendimentos(id) on delete cascade,
  taxa_administracao_percent numeric(7,4) not null,
  taxa_intermediacao_percent numeric(7,4) not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint regras_comerciais_unique unique (imobiliaria_id, empreendimento_id),
  constraint regras_comerciais_taxa_admin_check check (taxa_administracao_percent >= 0 and taxa_administracao_percent <= 100),
  constraint regras_comerciais_taxa_intermediacao_check check (taxa_intermediacao_percent >= 0 and taxa_intermediacao_percent <= 100)
);

drop trigger if exists set_regras_comerciais_atualizado_em on public.regras_comerciais;
create trigger set_regras_comerciais_atualizado_em
before update on public.regras_comerciais
for each row execute function public.set_atualizado_em();

create index if not exists regras_comerciais_imobiliaria_idx on public.regras_comerciais (imobiliaria_id);
create index if not exists regras_comerciais_empreendimento_idx on public.regras_comerciais (empreendimento_id);

insert into public.imobiliarias (nome, layout, ativo)
values
  ('Alive Imoveis', 'alive', true),
  ('Cesar Rego', 'cesar_rego', true),
  ('Plural Imobiliaria', 'plural', true)
on conflict (nome) do nothing;

insert into public.empreendimentos (nome, codigo, descricao, ativo)
values
  ('Grand Messejana II', 'GMII', 'Empreendimento com regra comercial Alive.', true),
  ('Grand Messejana I', 'GMI', 'Empreendimento com regra comercial Alive.', true),
  ('Grand Castelao I', 'GCI', 'Empreendimento com regra comercial Alive.', true),
  ('Terreno', 'TERRENO', 'Empreendimento com regra comercial Alive.', true),
  ('Locmais', 'LOCMAIS', 'Empreendimento com regra comercial Alive.', true),
  ('Grand Maracanau', 'GM_MARACANAU', 'Empreendimento com regra comercial Alive.', true),
  ('Galpao Pompilio Gomes', 'POMPILIO_GOMES', 'Empreendimento com regra comercial Cesar Rego.', true),
  ('Galpao Jose Walter', 'JOSE_WALTER', 'Empreendimento com regra comercial Plural.', true)
on conflict (nome) do update set
  codigo = coalesce(public.empreendimentos.codigo, excluded.codigo),
  descricao = coalesce(public.empreendimentos.descricao, excluded.descricao),
  ativo = true;

with seed(nome_imobiliaria, nome_empreendimento, taxa_administracao_percent, taxa_intermediacao_percent) as (
  values
    ('Alive Imoveis', 'Grand Messejana II', 7.0000, 60.0000),
    ('Alive Imoveis', 'Grand Messejana I', 6.0000, 50.0000),
    ('Alive Imoveis', 'Grand Castelao I', 7.0000, 60.0000),
    ('Alive Imoveis', 'Terreno', 7.0000, 60.0000),
    ('Alive Imoveis', 'Locmais', 7.0000, 60.0000),
    ('Alive Imoveis', 'Grand Maracanau', 7.0000, 70.0000),
    ('Cesar Rego', 'Galpao Pompilio Gomes', 4.0000, 50.0000),
    ('Plural Imobiliaria', 'Galpao Jose Walter', 8.0000, 50.0000)
)
insert into public.regras_comerciais (
  imobiliaria_id,
  empreendimento_id,
  taxa_administracao_percent,
  taxa_intermediacao_percent,
  ativo
)
select
  imobiliarias.id,
  empreendimentos.id,
  seed.taxa_administracao_percent,
  seed.taxa_intermediacao_percent,
  true
from seed
join public.imobiliarias on imobiliarias.nome = seed.nome_imobiliaria
join public.empreendimentos on empreendimentos.nome = seed.nome_empreendimento
on conflict (imobiliaria_id, empreendimento_id) do update set
  taxa_administracao_percent = excluded.taxa_administracao_percent,
  taxa_intermediacao_percent = excluded.taxa_intermediacao_percent,
  ativo = true;
