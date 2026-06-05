alter table public.fechamentos
add column if not exists aprovado_por text,
add column if not exists aprovado_em timestamptz;

alter table public.egestor_lancamentos
add column if not exists revalidado_em timestamptz,
add column if not exists revalidacao_status text,
add column if not exists revalidacao_mensagem text;

create table if not exists public.fechamento_status_eventos (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos(id) on delete cascade,
  status_anterior text,
  status_novo text not null,
  usuario text not null default 'Sistema',
  motivo text,
  criado_em timestamptz not null default now()
);

create index if not exists fechamento_status_eventos_fechamento_idx on public.fechamento_status_eventos (fechamento_id);
create index if not exists fechamento_status_eventos_criado_em_idx on public.fechamento_status_eventos (criado_em);
