-- IPTU como contas a pagar manual por imovel.
-- Evolui as tabelas iptu_carnes/iptu_parcelas (antes um registro passivo de
-- parcelas quitadas via import de certidao) para um controle operacional com
-- vencimento, valor previsto/pago, baixa e status calculado.
-- Continua SEM lancamento no eGestor e SEM vinculo com fechamentos.

-- iptu_carnes: origem (manual|importacao) + observacoes
alter table public.iptu_carnes add column if not exists origem text;
alter table public.iptu_carnes add column if not exists observacoes text;

-- Linhas pre-existentes nasceram do fluxo de importacao de certidao
update public.iptu_carnes set origem = 'importacao' where origem is null;

alter table public.iptu_carnes alter column origem set default 'manual';
alter table public.iptu_carnes alter column origem set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'iptu_carnes_origem_check') then
    alter table public.iptu_carnes
      add constraint iptu_carnes_origem_check check (origem in ('manual', 'importacao'));
  end if;
end $$;

-- iptu_parcelas: campos financeiros/operacionais
alter table public.iptu_parcelas add column if not exists data_vencimento date;
alter table public.iptu_parcelas add column if not exists valor_previsto numeric(14, 2) not null default 0;
alter table public.iptu_parcelas add column if not exists valor_pago numeric(14, 2);
alter table public.iptu_parcelas add column if not exists data_baixa date;
alter table public.iptu_parcelas add column if not exists observacoes text;
alter table public.iptu_parcelas add column if not exists criado_em timestamptz not null default now();
alter table public.iptu_parcelas add column if not exists atualizado_em timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'iptu_parcelas_valor_previsto_check') then
    alter table public.iptu_parcelas
      add constraint iptu_parcelas_valor_previsto_check check (valor_previsto >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'iptu_parcelas_valor_pago_check') then
    alter table public.iptu_parcelas
      add constraint iptu_parcelas_valor_pago_check check (valor_pago is null or valor_pago >= 0);
  end if;
end $$;

-- Compat: parcelas legadas pagas (import) nao tem data_baixa; sem ela cairiam em
-- "aberto" no status calculado. Usa a data de registro como baixa aproximada.
update public.iptu_parcelas
  set data_baixa = registrado_em::date
  where pago = true and data_baixa is null and registrado_em is not null;

-- Indices
create index if not exists idx_iptu_parcelas_vencimento on public.iptu_parcelas (data_vencimento);
create index if not exists idx_iptu_parcelas_baixa on public.iptu_parcelas (data_baixa);
create index if not exists idx_iptu_carnes_ano on public.iptu_carnes (ano_referencia);

-- Trigger de atualizado_em em iptu_parcelas (funcao ja existe: public.set_atualizado_em)
drop trigger if exists set_iptu_parcelas_atualizado_em on public.iptu_parcelas;
create trigger set_iptu_parcelas_atualizado_em
before update on public.iptu_parcelas
for each row execute function public.set_atualizado_em();

-- View denormalizada para a listagem (parcela + carne + imovel + imobiliaria +
-- empreendimento). Colunas planas evitam a fragilidade de filtrar/ordenar por
-- recursos aninhados no PostgREST e simplificam paginacao/contagem.
create or replace view public.iptu_parcelas_detalhe as
select
  p.id,
  p.carne_id,
  p.numero,
  p.data_vencimento,
  p.valor_previsto,
  p.valor_pago,
  p.data_baixa,
  p.observacoes,
  p.responsavel,
  p.origem_importacao_id,
  c.ano_referencia,
  c.origem,
  c.imovel_id,
  i.unidade,
  i.inquilino_nome,
  i.imobiliaria_id,
  i.empreendimento_id,
  im.nome as imobiliaria_nome,
  e.nome as empreendimento_nome
from public.iptu_parcelas p
join public.iptu_carnes c on c.id = p.carne_id
join public.imoveis i on i.id = c.imovel_id
left join public.imobiliarias im on im.id = i.imobiliaria_id
left join public.empreendimentos e on e.id = i.empreendimento_id;

-- RPC: geracao em lote transacional (ou cria tudo, ou nada).
-- A validacao de conflitos/regras acontece na aplicacao (TS); aqui garantimos
-- apenas a atomicidade do insert de carnes + parcelas.
create or replace function public.iptu_gerar_lote(p_carnes jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_carne jsonb;
  v_parcela jsonb;
  v_carne_id uuid;
  v_carnes_criados integer := 0;
  v_parcelas_criadas integer := 0;
begin
  for v_carne in select * from jsonb_array_elements(p_carnes)
  loop
    insert into public.iptu_carnes (imovel_id, ano_referencia, numero_parcelas, origem, observacoes)
    values (
      (v_carne->>'imovel_id')::uuid,
      (v_carne->>'ano')::integer,
      (v_carne->>'numero_parcelas')::integer,
      coalesce(nullif(v_carne->>'origem', ''), 'manual'),
      nullif(v_carne->>'observacoes', '')
    )
    returning id into v_carne_id;
    v_carnes_criados := v_carnes_criados + 1;

    for v_parcela in select * from jsonb_array_elements(coalesce(v_carne->'parcelas', '[]'::jsonb))
    loop
      insert into public.iptu_parcelas
        (carne_id, numero, data_vencimento, valor_previsto, observacoes, responsavel, pago)
      values (
        v_carne_id,
        (v_parcela->>'numero')::integer,
        nullif(v_parcela->>'data_vencimento', '')::date,
        coalesce((v_parcela->>'valor_previsto')::numeric, 0),
        nullif(v_parcela->>'observacoes', ''),
        nullif(v_parcela->>'responsavel', ''),
        false
      );
      v_parcelas_criadas := v_parcelas_criadas + 1;
    end loop;
  end loop;

  return jsonb_build_object('carnes_criados', v_carnes_criados, 'parcelas_criadas', v_parcelas_criadas);
end;
$$;

-- RPC: baixa (individual ou em massa) transacional.
-- Cada update so afeta parcelas sem baixa; se algum alvo ja estiver baixado ou
-- nao existir, levanta excecao e todo o lote e revertido.
create or replace function public.iptu_baixar_parcelas(
  p_updates jsonb,
  p_data_baixa date,
  p_observacoes text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_upd jsonb;
  v_id uuid;
  v_valor numeric;
  v_afetadas integer := 0;
  v_total_pago numeric := 0;
  v_rows integer;
begin
  if p_data_baixa is null then
    raise exception 'data_baixa e obrigatoria';
  end if;

  for v_upd in select * from jsonb_array_elements(p_updates)
  loop
    v_id := (v_upd->>'id')::uuid;
    v_valor := (v_upd->>'valor_pago')::numeric;
    if v_valor is null or v_valor < 0 then
      raise exception 'valor_pago invalido para a parcela %', v_id;
    end if;

    update public.iptu_parcelas
      set data_baixa = p_data_baixa,
          valor_pago = v_valor,
          pago = true,
          observacoes = coalesce(nullif(p_observacoes, ''), observacoes)
      where id = v_id and data_baixa is null;

    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'Parcela % nao encontrada ou ja baixada', v_id;
    end if;

    v_afetadas := v_afetadas + 1;
    v_total_pago := v_total_pago + v_valor;
  end loop;

  return jsonb_build_object('parcelas_baixadas', v_afetadas, 'total_pago', v_total_pago);
end;
$$;
