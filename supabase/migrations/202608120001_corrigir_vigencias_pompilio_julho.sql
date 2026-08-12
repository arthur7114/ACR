-- Corrige a vigência contratual de julho/2026 do Galpão Pompílio Gomes.
-- A prestação César Rêgo 41460 documenta os aluguéis de R$ 6.896,75 e
-- R$ 5.517,41; as vigências migradas ainda continham os valores anteriores.

do $$
declare
  v_empreendimento_id uuid;
  v_fechamento_id uuid;
  v_documento_id uuid;
  v_item record;
  v_imovel record;
  v_vigencia record;
  v_count integer;
begin
  select id
    into strict v_empreendimento_id
  from public.empreendimentos
  where nome = 'Galpão Pompilio Gomes'
    and ativo is true;

  select f.id
    into strict v_fechamento_id
  from public.fechamentos f
  where f.empreendimento_id = v_empreendimento_id
    and f.competencia = date '2026-07-01';

  select d.id
    into strict v_documento_id
  from public.documentos_fechamento d
  where d.fechamento_id = v_fechamento_id
    and d.tipo_documento = 'prestacao_contas'
    and d.sha256 = 'aa2b7e30a58c833d24224c3dbc1deefb2c4a3710fc09aee0a5c3d78509b520f7';

  for v_item in
    select expected.codigo, expected.valor_anterior, expected.valor_novo
    from (
      values
        ('0002526'::text, 6684.85::numeric, 6896.75::numeric),
        ('0002527'::text, 5347.89::numeric, 5517.41::numeric)
    ) as expected(codigo, valor_anterior, valor_novo)
  loop
    select
      i.id,
      i.imobiliaria_id,
      i.empreendimento_id,
      i.valor_aluguel_esperado
      into strict v_imovel
    from public.imoveis i
    where i.empreendimento_id = v_empreendimento_id
      and i.codigo_imobiliaria = v_item.codigo
      and i.ativo is true;

    if v_imovel.valor_aluguel_esperado is distinct from v_item.valor_novo then
      raise exception
        'Aluguel esperado divergente para o imóvel %: esperado %, encontrado %',
        v_item.codigo,
        v_item.valor_novo,
        v_imovel.valor_aluguel_esperado;
    end if;

    select
      v.id,
      v.modelo_receita,
      v.aluguel_contratado,
      v.vigencia_fim,
      v.documento_fonte_id
      into v_vigencia
    from public.imovel_vigencias v
    where v.imovel_id = v_imovel.id
      and v.ativo is true
      and v.vigencia_inicio = date '2026-07-01';

    if found then
      if v_vigencia.modelo_receita <> 'fixo'
         or v_vigencia.aluguel_contratado is distinct from v_item.valor_novo
         or v_vigencia.vigencia_fim is not null
         or v_vigencia.documento_fonte_id is distinct from v_documento_id then
        raise exception 'Vigência de julho divergente para o imóvel %', v_item.codigo;
      end if;

      select count(*)
        into v_count
      from public.imovel_vigencias v
      where v.imovel_id = v_imovel.id
        and v.ativo is true
        and v.vigencia_inicio < date '2026-07-01'
        and v.vigencia_fim = date '2026-06-01'
        and v.modelo_receita = 'fixo'
        and v.aluguel_contratado = v_item.valor_anterior;

      if v_count <> 1 then
        raise exception 'Histórico anterior divergente para o imóvel %', v_item.codigo;
      end if;

      select count(*)
        into v_count
      from public.auditoria_correcoes a
      where a.fechamento_id = v_fechamento_id
        and a.campo_alterado = format(
          'imovel_vigencias.aluguel_contratado[%s]',
          v_item.codigo
        )
        and a.valor_anterior = v_item.valor_anterior::text
        and a.valor_novo = v_item.valor_novo::text
        and a.justificativa = 'Correção baseada na prestação César Rêgo 41460 de julho/2026.';

      if v_count <> 1 then
        raise exception 'Auditoria divergente para o imóvel %', v_item.codigo;
      end if;
      continue;
    end if;

    select
      v.id,
      v.vigencia_inicio,
      v.modelo_receita,
      v.aluguel_contratado
      into strict v_vigencia
    from public.imovel_vigencias v
    where v.imovel_id = v_imovel.id
      and v.ativo is true
      and v.vigencia_inicio <= date '2026-07-01'
      and (v.vigencia_fim is null or v.vigencia_fim >= date '2026-07-01')
    for update;

    if v_vigencia.vigencia_inicio >= date '2026-07-01'
       or v_vigencia.modelo_receita <> 'fixo'
       or v_vigencia.aluguel_contratado is distinct from v_item.valor_anterior then
      raise exception 'Vigência anterior divergente para o imóvel %', v_item.codigo;
    end if;

    update public.imovel_vigencias
    set vigencia_fim = date '2026-06-01'
    where id = v_vigencia.id;

    insert into public.imovel_vigencias (
      imovel_id,
      imobiliaria_id,
      empreendimento_id,
      vigencia_inicio,
      vigencia_fim,
      modelo_receita,
      aluguel_contratado,
      fonte,
      documento_fonte_id,
      ativo
    ) values (
      v_imovel.id,
      v_imovel.imobiliaria_id,
      v_imovel.empreendimento_id,
      date '2026-07-01',
      null,
      'fixo',
      v_item.valor_novo,
      'Prestação César Rêgo 41460, competência 07/2026',
      v_documento_id,
      true
    );

    insert into public.auditoria_correcoes (
      fechamento_id,
      usuario,
      campo_alterado,
      valor_anterior,
      valor_novo,
      justificativa
    ) values (
      v_fechamento_id,
      'Sistema',
      format('imovel_vigencias.aluguel_contratado[%s]', v_item.codigo),
      v_item.valor_anterior::text,
      v_item.valor_novo::text,
      'Correção baseada na prestação César Rêgo 41460 de julho/2026.'
    );
  end loop;
end
$$;
