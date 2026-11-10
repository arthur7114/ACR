-- Fecha o acesso direto ao schema public pela chave publica (anon) e por
-- usuario autenticado. A aplicacao le e grava dados somente com a chave de
-- servico, no servidor; a chave publica serve apenas ao Supabase Auth.
-- As tabelas criadas ate julho/2026 nao tinham RLS e respondiam ao PostgREST
-- sem login. Esta migration aplica a todas, de uma vez, o mesmo padrao ja
-- usado nas tabelas novas (RLS ligado, sem policy, grants so para service_role).
-- Idempotente: pode rodar de novo sem efeito colateral.

do $$
declare
  r record;
  papel text;
begin
  -- Tabelas: RLS ligado e nenhum privilegio para anon/authenticated.
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;

  -- Views: rodam com a permissao de quem consulta, nao do dono.
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = true)', r.relname);
  end loop;

  foreach papel in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all privileges on all tables in schema public from %I', papel);
      execute format('revoke all privileges on all sequences in schema public from %I', papel);
      -- Tabelas, sequences e funcoes criadas daqui em diante nascem fechadas.
      execute format('alter default privileges in schema public revoke all on tables from %I', papel);
      execute format('alter default privileges in schema public revoke all on sequences from %I', papel);
      execute format('alter default privileges in schema public revoke all on functions from %I', papel);
    end if;
  end loop;

  -- Funcoes da aplicacao: o execute padrao vem de PUBLIC; sem isso anon
  -- chamaria RPC. Funcoes de extensao (btree_gist) ficam como estao, porque
  -- operadores e indices dependem delas.
  for r in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke all privileges on function %s from public', r.assinatura);
    foreach papel in array array['anon', 'authenticated']
    loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke all privileges on function %s from %I', r.assinatura, papel);
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', r.assinatura);
    end if;
  end loop;
  alter default privileges in schema public revoke all on functions from public;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all privileges on all tables in schema public to service_role;
    grant all privileges on all sequences in schema public to service_role;
  end if;
end
$$;
