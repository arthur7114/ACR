create extension if not exists pgcrypto;

create table if not exists public.imobiliarias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cnpj text,
  layout text not null default 'alive',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.empreendimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.fechamentos (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null references public.imobiliarias(id),
  empreendimento_id uuid not null references public.empreendimentos(id),
  competencia date not null,
  status text not null default 'rascunho',
  observacoes text,
  total_receitas numeric(14,2),
  total_despesas numeric(14,2),
  total_comissoes numeric(14,2),
  total_repassar numeric(14,2),
  valor_repassado_comprovante numeric(14,2),
  diferenca_total numeric(14,2),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (imobiliaria_id, empreendimento_id, competencia)
);

create table if not exists public.documentos_fechamento (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos(id) on delete cascade,
  tipo_documento text not null,
  nome_arquivo text not null,
  arquivo_url text not null,
  mime_type text not null,
  tamanho_bytes bigint not null,
  status_processamento text not null default 'aguardando',
  confianca_classificacao numeric(4,3),
  parser_versao text,
  erro_processamento text,
  classificado_manualmente boolean not null default false,
  remessa_numero integer not null default 1,
  criado_em timestamptz not null default now()
);

create table if not exists public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos(id) on delete cascade,
  documento_id uuid references public.documentos_fechamento(id) on delete set null,
  tipo_movimentacao text not null,
  categoria text,
  descricao text,
  valor numeric(14,2) not null,
  sinal text not null default 'positivo',
  data_competencia date,
  origem_documental text,
  confianca_extracao numeric(4,3),
  status_validacao text not null default 'pendente',
  corrigido_manualmente boolean not null default false,
  dados_extraidos jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.validacoes (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos(id) on delete cascade,
  documento_id uuid references public.documentos_fechamento(id) on delete set null,
  movimentacao_id uuid references public.movimentacoes(id) on delete set null,
  tipo_validacao text not null,
  severidade text not null default 'info',
  status text not null default 'aberta',
  mensagem text not null,
  valor_esperado numeric(14,2),
  valor_encontrado numeric(14,2),
  diferenca numeric(14,2),
  justificativa text,
  criado_em timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('fechamento-documentos', 'fechamento-documentos', false)
on conflict (id) do nothing;

insert into public.imobiliarias (nome, layout, ativo)
values ('Alive Imoveis', 'alive', true)
on conflict (nome) do nothing;

insert into public.empreendimentos (nome, descricao, ativo)
values ('Grand Messejana II', 'Fixture inicial do fluxo Alive / GM II', true)
on conflict (nome) do nothing;
