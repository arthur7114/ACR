alter table public.fechamentos
add column if not exists analise_completa jsonb;
