-- A via unica (202609160001) exigia `origem` no JSON: a coluna e NOT NULL e nao
-- tem default de tabela, e as RPCs anteriores assumiam 'processamento' quando o
-- item nao trazia. Restaura essa tolerancia. Encontrado na prova de INSERT em
-- begin/rollback logo apos aplicar a 0001.
create or replace function public.gravar_snapshots_indicadores(
  p_fechamento_id uuid,
  p_snapshots jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_chave text;
  v_desconhecidas text[];
  v_colunas text[];
  v_set text;
  v_col record;
  v_default jsonb;
  v_gravados integer := 0;
begin
  if jsonb_typeof(coalesce(p_snapshots, '[]'::jsonb)) <> 'array' then
    raise exception 'Snapshots devem ser um array.' using errcode = '22023';
  end if;

  select array_agg(column_name::text order by ordinal_position)
    into v_colunas
  from information_schema.columns
  where table_schema = 'public' and table_name = 'imovel_competencias';

  -- SET do upsert: toda coluna menos a chave natural, a PK e criado_em.
  select string_agg(format('%1$I = excluded.%1$I', c), ', ')
    into v_set
  from unnest(v_colunas) as c
  where c not in ('id', 'imovel_id', 'competencia', 'criado_em');

  for v_item in select value from jsonb_array_elements(coalesce(p_snapshots, '[]'::jsonb)) loop
    if nullif(v_item ->> 'imovel_id', '') is null then
      raise exception 'Snapshot sem vinculo de imovel.' using errcode = '22023';
    end if;

    -- Chave que nao e coluna: erro. E o oposto do descarte silencioso.
    select array_agg(k) into v_desconhecidas
    from jsonb_object_keys(v_item) as k
    where k <> all (v_colunas);
    if v_desconhecidas is not null then
      raise exception 'Snapshot com chave(s) sem coluna em imovel_competencias: %. Falta migration.',
        array_to_string(v_desconhecidas, ', ') using errcode = '22023';
    end if;

    -- String vazia e ausencia (mesma regra do nullif das versoes anteriores);
    -- texto vazio em coluna numerica/data falharia no cast.
    for v_chave in select k from jsonb_object_keys(v_item) as k loop
      if jsonb_typeof(v_item -> v_chave) = 'string' and v_item ->> v_chave = '' then
        v_item := v_item - v_chave;
      end if;
    end loop;

    v_item := v_item || jsonb_build_object('fechamento_id', p_fechamento_id);
    -- `origem` e NOT NULL sem default de tabela; as RPCs anteriores assumiam
    -- 'processamento' quando ausente. Mantem a tolerancia.
    if v_item -> 'origem' is null or jsonb_typeof(v_item -> 'origem') = 'null' then
      v_item := v_item || '{"origem":"processamento"}'::jsonb;
    end if;

    -- Coluna com DEFAULT ausente no JSON recebe o default avaliado, porque
    -- populate_record + INSERT ... SELECT nao aplica default a NULL explicito.
    for v_col in
      select column_name, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'imovel_competencias'
        and column_default is not null
    loop
      if v_item -> v_col.column_name is null or jsonb_typeof(v_item -> v_col.column_name) = 'null' then
        execute format('select to_jsonb(%s)', v_col.column_default) into v_default;
        v_item := v_item || jsonb_build_object(v_col.column_name, v_default);
      end if;
    end loop;

    execute format(
      'insert into public.imovel_competencias
         select * from jsonb_populate_record(null::public.imovel_competencias, $1)
       on conflict (imovel_id, competencia) do update set %s',
      v_set
    ) using v_item;
    v_gravados := v_gravados + 1;
  end loop;

  return v_gravados;
end;
$$;

revoke all on function public.gravar_snapshots_indicadores(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.gravar_snapshots_indicadores(uuid, jsonb) to service_role;
