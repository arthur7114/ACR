-- Permite várias linhas manuais com o mesmo tipo/categoria sem perder a
-- idempotência das linhas automáticas da prévia.
alter table public.egestor_lancamentos
  add column if not exists origem_chave text;

update public.egestor_lancamentos
set origem_chave = case
  when origem_manual then 'manual:' || id::text
  else 'auto:' || tipo || ':' || categoria
end
where origem_chave is null;

alter table public.egestor_lancamentos
  alter column origem_chave set default ('manual:' || gen_random_uuid()::text),
  alter column origem_chave set not null;

alter table public.egestor_lancamentos
  drop constraint if exists egestor_lancamentos_unique;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'egestor_lancamentos_origem_unique'
      and conrelid = 'public.egestor_lancamentos'::regclass
  ) then
    alter table public.egestor_lancamentos
      add constraint egestor_lancamentos_origem_unique
      unique (fechamento_id, origem_chave);
  end if;
end;
$$;
