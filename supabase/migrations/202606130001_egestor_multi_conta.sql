-- Multiplas contas eGestor com roteamento por empreendimento.
-- Migra o singleton egestor_configuracoes para uma conta "Global" e introduz
-- conta_id em mapeamentos, egestor_conta_id em empreendimentos e contato por
-- (imobiliaria, conta). Idempotente.

-- 1. Tabela de contas eGestor (substitui o singleton egestor_configuracoes).
create table if not exists public.egestor_contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  personal_token text,
  cod_disponivel_padrao integer,
  ativo boolean not null default true,
  ultimo_teste_status text,
  ultimo_teste_mensagem text,
  ultimo_teste_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists set_egestor_contas_atualizado_em on public.egestor_contas;
create trigger set_egestor_contas_atualizado_em
before update on public.egestor_contas
for each row execute function public.set_atualizado_em();

-- 2. Migra o singleton existente para a conta "Global" (id fixo p/ FKs estaveis).
insert into public.egestor_contas (
  id, nome, personal_token, cod_disponivel_padrao, ativo,
  ultimo_teste_status, ultimo_teste_mensagem, ultimo_teste_em
)
select
  '00000000-0000-0000-0000-000000000001'::uuid, 'Global',
  c.personal_token, c.cod_disponivel_padrao, c.ativo,
  c.ultimo_teste_status, c.ultimo_teste_mensagem, c.ultimo_teste_em
from public.egestor_configuracoes c
where c.id = true
on conflict (id) do nothing;

-- Garante a conta Global mesmo que o singleton nao exista.
insert into public.egestor_contas (id, nome, ativo)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'Global', false)
on conflict (id) do nothing;

-- 3. Plano de contas passa a ser por conta.
alter table public.egestor_mapeamentos_categoria
  add column if not exists conta_id uuid references public.egestor_contas(id) on delete cascade;

update public.egestor_mapeamentos_categoria
  set conta_id = '00000000-0000-0000-0000-000000000001'::uuid
  where conta_id is null;

alter table public.egestor_mapeamentos_categoria
  drop constraint if exists egestor_mapeamentos_categoria_pkey;
alter table public.egestor_mapeamentos_categoria
  add constraint egestor_mapeamentos_categoria_pkey primary key (conta_id, categoria);

create index if not exists egestor_mapeamentos_conta_idx
  on public.egestor_mapeamentos_categoria (conta_id);

-- 4. Roteamento da conta por empreendimento (null = conta Global padrao).
alter table public.empreendimentos
  add column if not exists egestor_conta_id uuid references public.egestor_contas(id) on delete set null;

create index if not exists empreendimentos_egestor_conta_idx
  on public.empreendimentos (egestor_conta_id);

-- 5. Contato eGestor por (imobiliaria, conta).
create table if not exists public.egestor_imobiliaria_contatos (
  imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
  conta_id uuid not null references public.egestor_contas(id) on delete cascade,
  egestor_contato_id integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (imobiliaria_id, conta_id)
);

drop trigger if exists set_egestor_imobiliaria_contatos_atualizado_em on public.egestor_imobiliaria_contatos;
create trigger set_egestor_imobiliaria_contatos_atualizado_em
before update on public.egestor_imobiliaria_contatos
for each row execute function public.set_atualizado_em();

-- Migra os contatos atuais (coluna legada) para a conta Global.
insert into public.egestor_imobiliaria_contatos (imobiliaria_id, conta_id, egestor_contato_id)
select i.id, '00000000-0000-0000-0000-000000000001'::uuid, i.egestor_contato_id
from public.imobiliarias i
where i.egestor_contato_id is not null
on conflict (imobiliaria_id, conta_id) do nothing;

-- 6. Seed da conta MMC Participacoes (token definido pela UI; nunca em migration).
insert into public.egestor_contas (id, nome, cod_disponivel_padrao, ativo)
values ('00000000-0000-0000-0000-000000000002'::uuid, 'MMC Participacoes', 2, true)
on conflict (id) do nothing;

insert into public.egestor_mapeamentos_categoria (conta_id, categoria, tipo_lancamento, cod_plano_contas, descricao)
values
  ('00000000-0000-0000-0000-000000000002'::uuid, 'repasse_mensal', 'recebimento', 52, 'Repasse mensal consolidado'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'comissao_administrativa', 'pagamento', 23, 'Comissao administrativa'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'energia', 'pagamento', 47, 'Despesas de energia eletrica'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'agua', 'pagamento', 13, 'Despesas de agua/esgoto'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'iptu', 'pagamento', 69, 'Despesas de IPTU'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'seguro', 'pagamento', 51, 'Despesas de seguro'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'outras_despesas', 'pagamento', 67, 'Outras despesas')
on conflict (conta_id, categoria) do nothing;
