alter table public.fechamentos
add column if not exists parecer_tecnico jsonb not null default '{}'::jsonb;
