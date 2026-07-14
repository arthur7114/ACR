create or replace function public.aplicar_correcao_fechamento(
  p_fechamento_id uuid,
  p_fechamento_patch jsonb,
  p_movimentacoes jsonb default '[]'::jsonb,
  p_validacoes jsonb default null,
  p_auditorias jsonb default '[]'::jsonb,
  p_imovel_operacao jsonb default null,
  p_permitir_status_fechado boolean default false,
  p_esperado_atualizado_em timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fechamento public.fechamentos%rowtype;
  v_imovel public.imoveis%rowtype;
  v_item jsonb;
  v_dados jsonb;
begin
  select * into v_fechamento
  from public.fechamentos
  where id = p_fechamento_id
  for update;

  if not found then raise exception 'Fechamento não encontrado.' using errcode = 'P0002'; end if;
  if p_esperado_atualizado_em is not null and v_fechamento.atualizado_em <> p_esperado_atualizado_em then
    raise exception 'O fechamento foi alterado por outra operação. Atualize a tela e tente novamente.' using errcode = '40001';
  end if;
  if not p_permitir_status_fechado and v_fechamento.status not in ('pendente_revisao', 'processado_com_sucesso') then
    raise exception 'Reabra a revisão antes de alterar o fechamento.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p_auditorias, '[]'::jsonb)) = 0 then
    raise exception 'Toda correção precisa de auditoria.' using errcode = 'P0001';
  end if;

  if p_imovel_operacao is not null then
    v_dados := coalesce(p_imovel_operacao -> 'dados', '{}'::jsonb);
    if p_imovel_operacao ->> 'modo' = 'criar' then
      insert into public.imoveis (
        id, empreendimento_id, imobiliaria_id, codigo_imobiliaria, unidade,
        inquilino_nome, status, valor_aluguel_esperado, ativo
      ) values (
        (p_imovel_operacao ->> 'id')::uuid, v_fechamento.empreendimento_id,
        v_fechamento.imobiliaria_id, v_dados ->> 'codigo_imobiliaria', v_dados ->> 'unidade',
        nullif(v_dados ->> 'inquilino_nome', ''), v_dados ->> 'status',
        nullif(v_dados ->> 'valor_aluguel_esperado', '')::numeric, true
      ) returning * into v_imovel;
    elsif p_imovel_operacao ->> 'modo' = 'atualizar' then
      select * into v_imovel from public.imoveis
      where id = (p_imovel_operacao ->> 'id')::uuid
        and imobiliaria_id = v_fechamento.imobiliaria_id
        and empreendimento_id = v_fechamento.empreendimento_id
        and ativo = true
      for update;
      if not found then raise exception 'Imóvel não encontrado neste fechamento.' using errcode = 'P0002'; end if;

      if v_dados <> '{}'::jsonb then
        update public.imoveis set
          inquilino_nome = case when v_dados ? 'inquilino_nome' then nullif(v_dados ->> 'inquilino_nome', '') else inquilino_nome end,
          status = case when v_dados ? 'status' then v_dados ->> 'status' else status end,
          valor_aluguel_esperado = case when v_dados ? 'valor_aluguel_esperado' then nullif(v_dados ->> 'valor_aluguel_esperado', '')::numeric else valor_aluguel_esperado end
        where id = v_imovel.id
        returning * into v_imovel;
      end if;
    else
      raise exception 'Operação de imóvel inválida.' using errcode = '22023';
    end if;
  end if;

  update public.fechamentos set
    analise_completa = case when p_fechamento_patch ? 'analise_completa' then p_fechamento_patch -> 'analise_completa' else analise_completa end,
    total_receitas = case when p_fechamento_patch ? 'total_receitas' then nullif(p_fechamento_patch ->> 'total_receitas', '')::numeric else total_receitas end,
    total_despesas = case when p_fechamento_patch ? 'total_despesas' then nullif(p_fechamento_patch ->> 'total_despesas', '')::numeric else total_despesas end,
    total_comissoes = case when p_fechamento_patch ? 'total_comissoes' then nullif(p_fechamento_patch ->> 'total_comissoes', '')::numeric else total_comissoes end,
    total_repassar = case when p_fechamento_patch ? 'total_repassar' then nullif(p_fechamento_patch ->> 'total_repassar', '')::numeric else total_repassar end,
    valor_repassado_comprovante = case when p_fechamento_patch ? 'valor_repassado_comprovante' then nullif(p_fechamento_patch ->> 'valor_repassado_comprovante', '')::numeric else valor_repassado_comprovante end,
    diferenca_total = case when p_fechamento_patch ? 'diferenca_total' then nullif(p_fechamento_patch ->> 'diferenca_total', '')::numeric else diferenca_total end,
    status = case when p_fechamento_patch ? 'status' then p_fechamento_patch ->> 'status' else status end,
    atualizado_em = now()
  where id = p_fechamento_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_movimentacoes, '[]'::jsonb)) loop
    update public.movimentacoes set
      data_competencia = case when v_item ? 'data_competencia' then nullif(v_item ->> 'data_competencia', '')::date else data_competencia end,
      dados_extraidos = case when v_item ? 'dados_extraidos' then v_item -> 'dados_extraidos' else dados_extraidos end,
      corrigido_manualmente = case when v_item ? 'corrigido_manualmente' then (v_item ->> 'corrigido_manualmente')::boolean else corrigido_manualmente end,
      imovel_id = case when v_item ? 'imovel_id' then nullif(v_item ->> 'imovel_id', '')::uuid else imovel_id end
    where id = (v_item ->> 'id')::uuid and fechamento_id = p_fechamento_id;
    if not found then raise exception 'Movimentação não pertence ao fechamento.' using errcode = 'P0002'; end if;
  end loop;

  if p_validacoes is not null then
    delete from public.validacoes where fechamento_id = p_fechamento_id;
    for v_item in select value from jsonb_array_elements(p_validacoes) loop
      insert into public.validacoes (
        fechamento_id, documento_id, movimentacao_id, tipo_validacao, severidade, status,
        mensagem, valor_esperado, valor_encontrado, diferenca, justificativa,
        resolvido_por, resolvido_em
      ) values (
        p_fechamento_id, nullif(v_item ->> 'documento_id', '')::uuid,
        nullif(v_item ->> 'movimentacao_id', '')::uuid, v_item ->> 'tipo_validacao',
        v_item ->> 'severidade', v_item ->> 'status', v_item ->> 'mensagem',
        nullif(v_item ->> 'valor_esperado', '')::numeric,
        nullif(v_item ->> 'valor_encontrado', '')::numeric,
        nullif(v_item ->> 'diferenca', '')::numeric, v_item ->> 'justificativa',
        v_item ->> 'resolvido_por', nullif(v_item ->> 'resolvido_em', '')::timestamptz
      );
    end loop;
  end if;

  for v_item in select value from jsonb_array_elements(p_auditorias) loop
    insert into public.auditoria_correcoes (
      fechamento_id, movimentacao_id, validacao_id, usuario, campo_alterado,
      valor_anterior, valor_novo, justificativa
    ) values (
      p_fechamento_id, nullif(v_item ->> 'movimentacao_id', '')::uuid,
      nullif(v_item ->> 'validacao_id', '')::uuid, v_item ->> 'usuario',
      v_item ->> 'campo_alterado', v_item ->> 'valor_anterior',
      v_item ->> 'valor_novo', v_item ->> 'justificativa'
    );
  end loop;

  return jsonb_build_object('imovel', case when v_imovel.id is null then null else to_jsonb(v_imovel) end);
end;
$$;

revoke all on function public.aplicar_correcao_fechamento(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.aplicar_correcao_fechamento(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, timestamptz) to service_role;
