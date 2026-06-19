-- Processamento em segundo plano + notificacoes in-app
-- (1) snapshot de progresso por fechamento (job destacado do request HTTP)
-- (2) tabela de notificacoes (sino do topo)

-- 1) Progresso do processamento ----------------------------------------------
alter table public.fechamentos
  add column if not exists processamento_status text,
  add column if not exists processamento_progress smallint,
  add column if not exists processamento_evento text,
  add column if not exists processamento_erro text,
  add column if not exists processamento_iniciado_em timestamptz,
  add column if not exists processamento_atualizado_em timestamptz;

comment on column public.fechamentos.processamento_status is
  'null = sem job em background; processando | concluido | erro';

-- 2) Notificacoes in-app ------------------------------------------------------
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid references public.fechamentos(id) on delete cascade,
  tipo text not null,            -- analise_concluida | analise_falhou
  titulo text not null,
  corpo text,
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists notificacoes_listagem_idx
  on public.notificacoes (lida, criado_em desc);
