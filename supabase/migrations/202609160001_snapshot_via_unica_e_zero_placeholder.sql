-- ============================================================================
-- Via UNICA de gravacao do snapshot mensal (classe A do registro de incidentes)
-- ============================================================================
-- Tres caminhos escreviam imovel_competencias, cada um com a propria lista de
-- colunas escrita a mao, e cada coluna nova precisava entrar nos tres. Duas
-- vezes em setembro uma ficou de fora (garagem_recebida, observacao) e o
-- ON CONFLICT escondeu: linha existente conservava o valor antigo, e a perda so
-- apareceria no INSERT de uma competencia inedita, meses depois.
--
-- Esta funcao nao enumera coluna nenhuma. As chaves do JSON SAO as colunas
-- (jsonb_populate_record), o SET do upsert e montado a partir do catalogo, e
-- chave desconhecida e ERRO, nao descarte silencioso: se o builder ganhar um
-- campo antes da migration, a gravacao falha alto em vez de perder o dado.
-- As duas RPCs abaixo passam a delegar aqui; a via TypeScript tambem
-- (upsertIndicadoresSnapshotRows chama esta RPC).
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

create or replace function public.persistir_pacote_fechamento_v1(
  p_fechamento_id uuid,
  p_esperado_atualizado_em timestamptz,
  p_fechamento_patch jsonb,
  p_movimentacoes jsonb,
  p_snapshots jsonb,
  p_validacoes jsonb,
  p_documentos_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fechamento public.fechamentos%rowtype;
  v_item jsonb;
  v_atualizado_em timestamptz;
begin
  if jsonb_typeof(coalesce(p_movimentacoes, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_snapshots, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_validacoes, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_documentos_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'Movimentações, snapshots, validações e documentos devem ser arrays.' using errcode = '22023';
  end if;

  select * into v_fechamento
  from public.fechamentos
  where id = p_fechamento_id
  for update;
  if not found then
    raise exception 'Fechamento não encontrado.' using errcode = 'P0002';
  end if;
  if p_esperado_atualizado_em is null or v_fechamento.atualizado_em <> p_esperado_atualizado_em then
    raise exception 'O fechamento foi alterado durante o processamento. Reprocesse a remessa.' using errcode = '40001';
  end if;

  update public.fechamentos set
    status = p_fechamento_patch ->> 'status',
    total_receitas = nullif(p_fechamento_patch ->> 'total_receitas', '')::numeric,
    total_despesas = nullif(p_fechamento_patch ->> 'total_despesas', '')::numeric,
    total_comissoes = nullif(p_fechamento_patch ->> 'total_comissoes', '')::numeric,
    total_repassar = nullif(p_fechamento_patch ->> 'total_repassar', '')::numeric,
    valor_repassado_comprovante = nullif(p_fechamento_patch ->> 'valor_repassado_comprovante', '')::numeric,
    diferenca_total = nullif(p_fechamento_patch ->> 'diferenca_total', '')::numeric,
    parecer_tecnico = p_fechamento_patch -> 'parecer_tecnico',
    analise_completa = p_fechamento_patch -> 'analise_completa',
    atualizado_em = now()
  where id = p_fechamento_id
  returning atualizado_em into v_atualizado_em;

  update public.documentos_fechamento
  set status_processamento = 'processado', erro_processamento = null
  where fechamento_id = p_fechamento_id
    and id in (
      select value::text::uuid
      from jsonb_array_elements_text(coalesce(p_documentos_ids, '[]'::jsonb))
    );

  delete from public.validacoes where fechamento_id = p_fechamento_id;
  delete from public.movimentacoes
  where fechamento_id = p_fechamento_id and not corrigido_manualmente;

  for v_item in select value from jsonb_array_elements(coalesce(p_movimentacoes, '[]'::jsonb)) loop
    insert into public.movimentacoes (
      fechamento_id, documento_id, imovel_id, tipo_movimentacao, categoria,
      descricao, valor, sinal, data_competencia, origem_documental,
      confianca_extracao, status_validacao, corrigido_manualmente, dados_extraidos
    ) values (
      p_fechamento_id,
      nullif(v_item ->> 'documento_id', '')::uuid,
      nullif(v_item ->> 'imovel_id', '')::uuid,
      v_item ->> 'tipo_movimentacao',
      nullif(v_item ->> 'categoria', ''),
      nullif(v_item ->> 'descricao', ''),
      (v_item ->> 'valor')::numeric,
      coalesce(nullif(v_item ->> 'sinal', ''), 'positivo'),
      nullif(v_item ->> 'data_competencia', '')::date,
      nullif(v_item ->> 'origem_documental', ''),
      nullif(v_item ->> 'confianca_extracao', '')::numeric,
      coalesce(nullif(v_item ->> 'status_validacao', ''), 'pendente'),
      false,
      coalesce(v_item -> 'dados_extraidos', '{}'::jsonb)
    );
  end loop;

  perform public.gravar_snapshots_indicadores(p_fechamento_id, p_snapshots);

  for v_item in select value from jsonb_array_elements(coalesce(p_validacoes, '[]'::jsonb)) loop
    insert into public.validacoes (
      fechamento_id, documento_id, movimentacao_id, tipo_validacao, severidade,
      status, mensagem, valor_esperado, valor_encontrado, diferenca,
      justificativa, resolvido_por, resolvido_em
    ) values (
      p_fechamento_id, nullif(v_item ->> 'documento_id', '')::uuid,
      nullif(v_item ->> 'movimentacao_id', '')::uuid,
      v_item ->> 'tipo_validacao', v_item ->> 'severidade', v_item ->> 'status',
      v_item ->> 'mensagem', nullif(v_item ->> 'valor_esperado', '')::numeric,
      nullif(v_item ->> 'valor_encontrado', '')::numeric,
      nullif(v_item ->> 'diferenca', '')::numeric,
      v_item ->> 'justificativa', v_item ->> 'resolvido_por',
      nullif(v_item ->> 'resolvido_em', '')::timestamptz
    );
  end loop;

  return jsonb_build_object(
    'fechamento_id', p_fechamento_id,
    'atualizado_em', v_atualizado_em,
    'movimentacoes_inseridas', jsonb_array_length(coalesce(p_movimentacoes, '[]'::jsonb)),
    'snapshots_gravados', jsonb_array_length(coalesce(p_snapshots, '[]'::jsonb)),
    'validacoes_inseridas', jsonb_array_length(coalesce(p_validacoes, '[]'::jsonb))
  );
end;
$$;

create or replace function public.aplicar_reparo_indicadores_v4(
  p_fechamento_id uuid,
  p_esperado_atualizado_em timestamptz,
  p_fechamento_patch jsonb,
  p_movimentacoes jsonb,
  p_snapshots jsonb,
  p_validacoes jsonb,
  p_auditoria jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fechamento public.fechamentos%rowtype;
  v_item jsonb;
  v_atualizado_em timestamptz;
  v_movimentacoes_inseridas integer := 0;
  v_snapshots_gravados integer := 0;
  v_validacoes_inseridas integer := 0;
begin
  if jsonb_typeof(coalesce(p_movimentacoes, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_snapshots, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_validacoes, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_auditoria, '[]'::jsonb)) <> 'array' then
    raise exception 'Movimentações, snapshots, validações e auditoria devem ser arrays.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_auditoria, '[]'::jsonb)) = 0 then
    raise exception 'Todo reparo precisa registrar auditoria antes/depois.'
      using errcode = 'P0001';
  end if;

  select * into v_fechamento
  from public.fechamentos
  where id = p_fechamento_id
  for update;

  if not found then
    raise exception 'Fechamento não encontrado.' using errcode = 'P0002';
  end if;
  if p_esperado_atualizado_em is null
     or v_fechamento.atualizado_em <> p_esperado_atualizado_em then
    raise exception 'O fechamento foi alterado por outra operação. Refaça o dry-run.'
      using errcode = '40001';
  end if;

  update public.fechamentos
  set
    analise_completa = case when p_fechamento_patch ? 'analise_completa' then p_fechamento_patch -> 'analise_completa' else analise_completa end,
    total_receitas = case when p_fechamento_patch ? 'total_receitas' then nullif(p_fechamento_patch ->> 'total_receitas', '')::numeric else total_receitas end,
    total_despesas = case when p_fechamento_patch ? 'total_despesas' then nullif(p_fechamento_patch ->> 'total_despesas', '')::numeric else total_despesas end,
    total_comissoes = case when p_fechamento_patch ? 'total_comissoes' then nullif(p_fechamento_patch ->> 'total_comissoes', '')::numeric else total_comissoes end,
    total_repassar = case when p_fechamento_patch ? 'total_repassar' then nullif(p_fechamento_patch ->> 'total_repassar', '')::numeric else total_repassar end,
    atualizado_em = now()
  where id = p_fechamento_id
  returning atualizado_em into v_atualizado_em;

  delete from public.validacoes where fechamento_id = p_fechamento_id;
  delete from public.movimentacoes
  where fechamento_id = p_fechamento_id
    and (tipo_movimentacao = 'receita_aluguel' or origem_documental = 'rateio_ted');

  for v_item in
    select value from jsonb_array_elements(coalesce(p_movimentacoes, '[]'::jsonb))
  loop
    if not (
      coalesce(v_item ->> 'tipo_movimentacao', '') = 'receita_aluguel'
      or (
        coalesce(v_item ->> 'tipo_movimentacao', '') = 'despesa'
        and coalesce(v_item ->> 'origem_documental', '') = 'rateio_ted'
      )
    ) then
      raise exception 'O reparo v4 aceita apenas receita_aluguel ou despesa com origem rateio_ted.'
        using errcode = '22023';
    end if;

    insert into public.movimentacoes (
      id, fechamento_id, documento_id, imovel_id, tipo_movimentacao, categoria,
      descricao, valor, sinal, data_competencia, origem_documental,
      confianca_extracao, status_validacao, corrigido_manualmente, dados_extraidos
    ) values (
      coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid()),
      p_fechamento_id,
      nullif(v_item ->> 'documento_id', '')::uuid,
      nullif(v_item ->> 'imovel_id', '')::uuid,
      v_item ->> 'tipo_movimentacao',
      nullif(v_item ->> 'categoria', ''),
      nullif(v_item ->> 'descricao', ''),
      (v_item ->> 'valor')::numeric,
      coalesce(nullif(v_item ->> 'sinal', ''), 'positivo'),
      nullif(v_item ->> 'data_competencia', '')::date,
      nullif(v_item ->> 'origem_documental', ''),
      nullif(v_item ->> 'confianca_extracao', '')::numeric,
      coalesce(nullif(v_item ->> 'status_validacao', ''), 'pendente'),
      coalesce((v_item ->> 'corrigido_manualmente')::boolean, false),
      coalesce(v_item -> 'dados_extraidos', '{}'::jsonb)
    );
    v_movimentacoes_inseridas := v_movimentacoes_inseridas + 1;
  end loop;

  v_snapshots_gravados := public.gravar_snapshots_indicadores(p_fechamento_id, p_snapshots);

  for v_item in
    select value from jsonb_array_elements(coalesce(p_validacoes, '[]'::jsonb))
  loop
    insert into public.validacoes (
      fechamento_id, documento_id, movimentacao_id, tipo_validacao, severidade,
      status, mensagem, valor_esperado, valor_encontrado, diferenca,
      justificativa, resolvido_por, resolvido_em
    ) values (
      p_fechamento_id,
      nullif(v_item ->> 'documento_id', '')::uuid,
      nullif(v_item ->> 'movimentacao_id', '')::uuid,
      v_item ->> 'tipo_validacao',
      v_item ->> 'severidade',
      v_item ->> 'status',
      v_item ->> 'mensagem',
      nullif(v_item ->> 'valor_esperado', '')::numeric,
      nullif(v_item ->> 'valor_encontrado', '')::numeric,
      nullif(v_item ->> 'diferenca', '')::numeric,
      v_item ->> 'justificativa',
      v_item ->> 'resolvido_por',
      nullif(v_item ->> 'resolvido_em', '')::timestamptz
    );
    v_validacoes_inseridas := v_validacoes_inseridas + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(p_auditoria)
  loop
    insert into public.auditoria_correcoes (
      fechamento_id, movimentacao_id, validacao_id, usuario, campo_alterado,
      valor_anterior, valor_novo, justificativa
    ) values (
      p_fechamento_id,
      nullif(v_item ->> 'movimentacao_id', '')::uuid,
      nullif(v_item ->> 'validacao_id', '')::uuid,
      coalesce(nullif(v_item ->> 'usuario', ''), 'reparador-indicadores-v4'),
      v_item ->> 'campo_alterado',
      v_item ->> 'valor_anterior',
      v_item ->> 'valor_novo',
      v_item ->> 'justificativa'
    );
  end loop;

  return jsonb_build_object(
    'fechamento_id', p_fechamento_id,
    'atualizado_em', v_atualizado_em,
    'movimentacoes_inseridas', v_movimentacoes_inseridas,
    'snapshots_gravados', v_snapshots_gravados,
    'validacoes_inseridas', v_validacoes_inseridas
  );
end;
$$;

revoke all on function public.persistir_pacote_fechamento_v1(uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persistir_pacote_fechamento_v1(uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
revoke all on function public.aplicar_reparo_indicadores_v4(uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_reparo_indicadores_v4(uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;


-- ============================================================================
-- Zero nao e valor conhecido (classe C do registro de incidentes)
-- ============================================================================
-- O cadastro migrado trouxe aluguel 0 como placeholder; a cobertura so contava
-- NULL, o zero passou como conhecido e a vacancia ficou menor por quatro meses.
-- Aqui o estado deixa de ser representavel: aluguel e NULL (nao se sabe) ou
-- positivo. As constraints entram NOT VALID para nao bloquear as linhas que ja
-- existem (TERRENO CASTELAO e mais duas vigencias em zero, pendentes de
-- decisao); toda escrita nova ja obedece. `validate constraint` quando o
-- residuo for resolvido.
update public.imoveis i
set valor_aluguel_esperado = null
where i.valor_aluguel_esperado = 0
  and exists (
    select 1 from public.imovel_vigencias v
    where v.imovel_id = i.id and v.ativo and v.modelo_receita <> 'fixo'
  );

alter table public.imoveis
  drop constraint if exists imoveis_valor_aluguel_esperado_nao_zero_check;
alter table public.imoveis
  add constraint imoveis_valor_aluguel_esperado_nao_zero_check
  check (valor_aluguel_esperado is null or valor_aluguel_esperado > 0) not valid;

alter table public.imovel_vigencias
  drop constraint if exists imovel_vigencias_aluguel_contratado_nao_zero_check;
alter table public.imovel_vigencias
  add constraint imovel_vigencias_aluguel_contratado_nao_zero_check
  check (aluguel_contratado is null or aluguel_contratado > 0) not valid;

comment on constraint imoveis_valor_aluguel_esperado_nao_zero_check on public.imoveis is
  'Aluguel e NULL (desconhecido) ou positivo. Zero era placeholder de migracao e passava por valor conhecido.';
comment on constraint imovel_vigencias_aluguel_contratado_nao_zero_check on public.imovel_vigencias is
  'Aluguel contratado e NULL (desconhecido) ou positivo. NOT VALID: linhas anteriores em zero seguem pendentes de decisao.';
