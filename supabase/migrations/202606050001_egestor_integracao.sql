alter table public.imobiliarias
add column if not exists egestor_contato_id integer;

create table if not exists public.egestor_configuracoes (
  id boolean primary key default true,
  personal_token text,
  cod_disponivel_padrao integer,
  ativo boolean not null default false,
  ultimo_teste_status text,
  ultimo_teste_mensagem text,
  ultimo_teste_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint egestor_configuracoes_singleton check (id)
);

insert into public.egestor_configuracoes (id, ativo)
values (true, false)
on conflict (id) do nothing;

create table if not exists public.egestor_mapeamentos_categoria (
  categoria text primary key,
  tipo_lancamento text not null,
  cod_plano_contas integer,
  tags text[] not null default '{}'::text[],
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint egestor_mapeamentos_tipo_check check (tipo_lancamento in ('recebimento', 'pagamento'))
);

insert into public.egestor_mapeamentos_categoria (categoria, tipo_lancamento, descricao)
values
  ('repasse_mensal', 'recebimento', 'Repasse mensal consolidado'),
  ('comissao_administrativa', 'pagamento', 'Comissao administrativa'),
  ('energia', 'pagamento', 'Despesas de energia eletrica'),
  ('agua', 'pagamento', 'Despesas de agua/esgoto'),
  ('iptu', 'pagamento', 'Despesas de IPTU'),
  ('seguro', 'pagamento', 'Despesas de seguro'),
  ('outras_despesas', 'pagamento', 'Outras despesas')
on conflict (categoria) do nothing;

create table if not exists public.egestor_lancamentos (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos(id) on delete cascade,
  tipo text not null,
  categoria text not null,
  descricao text not null,
  valor numeric(14,2) not null,
  cod_contato integer,
  cod_disponivel integer,
  cod_plano_contas integer,
  tags text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pendente_config',
  validacao_mensagem text,
  egestor_codigo integer,
  egestor_cod_modulo integer,
  egestor_response jsonb,
  enviado_em timestamptz,
  anexo_status text,
  anexo_mensagem text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint egestor_lancamentos_tipo_check check (tipo in ('recebimento', 'pagamento')),
  constraint egestor_lancamentos_status_check check (status in ('validado', 'pendente_config', 'enviado', 'erro', 'anexo_pendente')),
  constraint egestor_lancamentos_unique unique (fechamento_id, tipo, categoria)
);

create table if not exists public.egestor_envios (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos(id) on delete cascade,
  lancamento_id uuid references public.egestor_lancamentos(id) on delete set null,
  acao text not null,
  status text not null,
  request_payload jsonb,
  response_payload jsonb,
  erro text,
  criado_em timestamptz not null default now()
);

create index if not exists egestor_lancamentos_fechamento_idx on public.egestor_lancamentos (fechamento_id);
create index if not exists egestor_lancamentos_status_idx on public.egestor_lancamentos (status);
create index if not exists egestor_envios_fechamento_idx on public.egestor_envios (fechamento_id);

drop trigger if exists set_egestor_configuracoes_atualizado_em on public.egestor_configuracoes;
create trigger set_egestor_configuracoes_atualizado_em
before update on public.egestor_configuracoes
for each row execute function public.set_atualizado_em();

drop trigger if exists set_egestor_mapeamentos_categoria_atualizado_em on public.egestor_mapeamentos_categoria;
create trigger set_egestor_mapeamentos_categoria_atualizado_em
before update on public.egestor_mapeamentos_categoria
for each row execute function public.set_atualizado_em();

drop trigger if exists set_egestor_lancamentos_atualizado_em on public.egestor_lancamentos;
create trigger set_egestor_lancamentos_atualizado_em
before update on public.egestor_lancamentos
for each row execute function public.set_atualizado_em();
