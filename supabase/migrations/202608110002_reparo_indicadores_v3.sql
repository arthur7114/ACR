-- Reparo histórico atômico: análise/totais, receitas, rateio TED, validações e
-- auditoria são atualizados sob o mesmo lock otimista do fechamento.
create or replace function public.aplicar_reparo_indicadores_v3(
  p_fechamento_id uuid,
  p_esperado_atualizado_em timestamptz,
  p_fechamento_patch jsonb,
  p_movimentacoes jsonb,
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
  v_validacoes_inseridas integer := 0;
begin
  if jsonb_typeof(coalesce(p_movimentacoes, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_validacoes, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_auditoria, '[]'::jsonb)) <> 'array' then
    raise exception 'Movimentações, validações e auditoria devem ser arrays.'
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

  delete from public.validacoes
  where fechamento_id = p_fechamento_id;

  delete from public.movimentacoes
  where fechamento_id = p_fechamento_id
    and (
      tipo_movimentacao = 'receita_aluguel'
      or origem_documental = 'rateio_ted'
    );

  for v_item in
    select value from jsonb_array_elements(coalesce(p_movimentacoes, '[]'::jsonb))
  loop
    if coalesce(v_item ->> 'tipo_movimentacao', '') <> 'receita_aluguel'
       and coalesce(v_item ->> 'origem_documental', '') <> 'rateio_ted' then
      raise exception 'O reparo v3 aceita apenas receitas de aluguel e rateio TED.'
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

  for v_item in
    select value from jsonb_array_elements(p_auditoria)
  loop
    insert into public.auditoria_correcoes (
      fechamento_id, movimentacao_id, validacao_id, usuario, campo_alterado,
      valor_anterior, valor_novo, justificativa
    ) values (
      p_fechamento_id,
      nullif(v_item ->> 'movimentacao_id', '')::uuid,
      nullif(v_item ->> 'validacao_id', '')::uuid,
      coalesce(nullif(v_item ->> 'usuario', ''), 'reparador-indicadores-v3'),
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
    'validacoes_inseridas', v_validacoes_inseridas
  );
end;
$$;

revoke all on function public.aplicar_reparo_indicadores_v3(
  uuid, timestamptz, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.aplicar_reparo_indicadores_v3(
  uuid, timestamptz, jsonb, jsonb, jsonb, jsonb
) to service_role;
