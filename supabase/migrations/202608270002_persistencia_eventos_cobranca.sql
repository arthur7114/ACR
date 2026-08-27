-- Atualiza a RPC atômica para gravar as colunas novas do sub-plano B
-- (eventos e cobranca_esperada). Mesma assinatura e semântica; apenas as duas
-- colunas aditivas entram no insert e no upsert do snapshot. Chamadores antigos
-- (payload sem os campos) continuam válidos: eventos cai em '[]' e
-- cobranca_esperada em null.
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

  for v_item in select value from jsonb_array_elements(coalesce(p_snapshots, '[]'::jsonb)) loop
    if nullif(v_item ->> 'imovel_id', '') is null then
      raise exception 'Snapshot sem vínculo de imóvel.' using errcode = '22023';
    end if;
    insert into public.imovel_competencias (
      imovel_id, fechamento_id, competencia, status_ocupacao, status_origem,
      inquilino_nome, aluguel_esperado, aluguel_esperado_origem,
      cobranca_esperada, eventos,
      aluguel_recebido, aluguel_competencia, atrasos_recuperados,
      atrasos_competencia_origem, outros_recebimentos, entradas_passagem,
      saidas_passagem, receita_total, desconto, comissao_administracao,
      repasse_apurado, vencimento_referencia, competencia_original,
      competencia_recebimento, dia_vencimento, modelo_receita,
      status_mensal_explicito, quantidade_linhas, origem, qualidade,
      calculo_versao, checksum
    ) values (
      (v_item ->> 'imovel_id')::uuid, p_fechamento_id,
      (v_item ->> 'competencia')::date, v_item ->> 'status_ocupacao',
      v_item ->> 'status_origem', nullif(v_item ->> 'inquilino_nome', ''),
      nullif(v_item ->> 'aluguel_esperado', '')::numeric,
      nullif(v_item ->> 'aluguel_esperado_origem', ''),
      nullif(v_item ->> 'cobranca_esperada', '')::numeric,
      coalesce(v_item -> 'eventos', '[]'::jsonb),
      nullif(v_item ->> 'aluguel_recebido', '')::numeric,
      nullif(v_item ->> 'aluguel_competencia', '')::numeric,
      nullif(v_item ->> 'atrasos_recuperados', '')::numeric,
      nullif(v_item ->> 'atrasos_competencia_origem', '')::date,
      nullif(v_item ->> 'outros_recebimentos', '')::numeric,
      nullif(v_item ->> 'entradas_passagem', '')::numeric,
      nullif(v_item ->> 'saidas_passagem', '')::numeric,
      nullif(v_item ->> 'receita_total', '')::numeric,
      nullif(v_item ->> 'desconto', '')::numeric,
      nullif(v_item ->> 'comissao_administracao', '')::numeric,
      nullif(v_item ->> 'repasse_apurado', '')::numeric,
      nullif(v_item ->> 'vencimento_referencia', ''),
      nullif(v_item ->> 'competencia_original', '')::date,
      nullif(v_item ->> 'competencia_recebimento', '')::date,
      nullif(v_item ->> 'dia_vencimento', '')::smallint,
      nullif(v_item ->> 'modelo_receita', ''),
      nullif(v_item ->> 'status_mensal_explicito', ''),
      coalesce(nullif(v_item ->> 'quantidade_linhas', '')::integer, 0),
      coalesce(nullif(v_item ->> 'origem', ''), 'processamento'),
      v_item ->> 'qualidade', v_item ->> 'calculo_versao', v_item ->> 'checksum'
    ) on conflict (imovel_id, competencia) do update set
      fechamento_id = excluded.fechamento_id,
      status_ocupacao = excluded.status_ocupacao,
      status_origem = excluded.status_origem,
      inquilino_nome = excluded.inquilino_nome,
      aluguel_esperado = excluded.aluguel_esperado,
      aluguel_esperado_origem = excluded.aluguel_esperado_origem,
      cobranca_esperada = excluded.cobranca_esperada,
      eventos = excluded.eventos,
      aluguel_recebido = excluded.aluguel_recebido,
      aluguel_competencia = excluded.aluguel_competencia,
      atrasos_recuperados = excluded.atrasos_recuperados,
      atrasos_competencia_origem = excluded.atrasos_competencia_origem,
      outros_recebimentos = excluded.outros_recebimentos,
      entradas_passagem = excluded.entradas_passagem,
      saidas_passagem = excluded.saidas_passagem,
      receita_total = excluded.receita_total,
      desconto = excluded.desconto,
      comissao_administracao = excluded.comissao_administracao,
      repasse_apurado = excluded.repasse_apurado,
      vencimento_referencia = excluded.vencimento_referencia,
      competencia_original = excluded.competencia_original,
      competencia_recebimento = excluded.competencia_recebimento,
      dia_vencimento = excluded.dia_vencimento,
      modelo_receita = excluded.modelo_receita,
      status_mensal_explicito = excluded.status_mensal_explicito,
      quantidade_linhas = excluded.quantidade_linhas,
      origem = excluded.origem,
      qualidade = excluded.qualidade,
      calculo_versao = excluded.calculo_versao,
      checksum = excluded.checksum;
  end loop;

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

revoke all on function public.persistir_pacote_fechamento_v1(
  uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.persistir_pacote_fechamento_v1(
  uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;
