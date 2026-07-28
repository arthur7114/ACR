-- Base aditiva para os Indicadores v2.
--
-- A migration preserva todos os documentos e fechamentos existentes. Cadastros
-- equivalentes são reapontados somente quando a operação não viola uma chave
-- histórica; conflitos remanescentes ficam inativos e continuam auditáveis.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- 1. Fonte documental reutilizável e deduplicação por conteúdo
-- ---------------------------------------------------------------------------

create table if not exists public.documento_fontes (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null,
  arquivo_url text not null,
  mime_type text not null,
  tamanho_bytes bigint not null,
  criado_em timestamptz not null default now(),
  constraint documento_fontes_sha256_check
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint documento_fontes_tamanho_check
    check (tamanho_bytes >= 0),
  constraint documento_fontes_sha256_unique
    unique (sha256)
);

alter table public.documentos_fechamento
  add column if not exists sha256 text,
  add column if not exists fonte_id uuid references public.documento_fontes(id) on delete restrict,
  add column if not exists duplicado_de_id uuid references public.documentos_fechamento(id) on delete set null;

alter table public.documentos_fechamento
  drop constraint if exists documentos_fechamento_sha256_check;

alter table public.documentos_fechamento
  add constraint documentos_fechamento_sha256_check
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');

create index if not exists documentos_fechamento_sha256_idx
  on public.documentos_fechamento (sha256)
  where sha256 is not null;

create index if not exists documentos_fechamento_fonte_idx
  on public.documentos_fechamento (fonte_id)
  where fonte_id is not null;

create index if not exists documentos_fechamento_duplicado_idx
  on public.documentos_fechamento (duplicado_de_id)
  where duplicado_de_id is not null;

-- Um conteúdo tem no máximo um documento canônico dentro do fechamento.
-- Registros redundantes já existentes podem receber duplicado_de_id sem serem
-- apagados, mantendo o histórico documental.
create unique index if not exists documentos_fechamento_conteudo_canonico_unique
  on public.documentos_fechamento (fechamento_id, sha256)
  where sha256 is not null and duplicado_de_id is null;

alter table public.documento_fontes enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all privileges on table public.documento_fontes from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all privileges on table public.documento_fontes from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all privileges on table public.documento_fontes to service_role';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Vigência histórica do imóvel
-- ---------------------------------------------------------------------------

create table if not exists public.imovel_vigencias (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references public.imoveis(id) on delete cascade,
  imobiliaria_id uuid not null references public.imobiliarias(id) on delete restrict,
  empreendimento_id uuid not null references public.empreendimentos(id) on delete restrict,
  vigencia_inicio date not null,
  vigencia_fim date,
  modelo_receita text not null,
  aluguel_contratado numeric(14,2),
  fonte text not null,
  documento_fonte_id uuid references public.documentos_fechamento(id) on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint imovel_vigencias_modelo_receita_check
    check (modelo_receita in ('fixo', 'variavel', 'nao_aplicavel')),
  constraint imovel_vigencias_competencia_inicio_check
    check (extract(day from vigencia_inicio) = 1),
  constraint imovel_vigencias_competencia_fim_check
    check (vigencia_fim is null or extract(day from vigencia_fim) = 1),
  constraint imovel_vigencias_intervalo_check
    check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  constraint imovel_vigencias_aluguel_check
    check (
      aluguel_contratado is null
      or (modelo_receita = 'fixo' and aluguel_contratado >= 0)
    ),
  constraint imovel_vigencias_intervalo_ativo_excl
    exclude using gist (
      imovel_id with =,
      daterange(
        vigencia_inicio,
        coalesce(vigencia_fim + 1, 'infinity'::date),
        '[)'
      ) with &&
    ) where (ativo)
);

create index if not exists imovel_vigencias_competencia_idx
  on public.imovel_vigencias (vigencia_inicio, vigencia_fim);

create index if not exists imovel_vigencias_imobiliaria_competencia_idx
  on public.imovel_vigencias (imobiliaria_id, vigencia_inicio, vigencia_fim)
  where ativo;

create index if not exists imovel_vigencias_empreendimento_competencia_idx
  on public.imovel_vigencias (empreendimento_id, vigencia_inicio, vigencia_fim)
  where ativo;

drop trigger if exists set_imovel_vigencias_atualizado_em on public.imovel_vigencias;
create trigger set_imovel_vigencias_atualizado_em
before update on public.imovel_vigencias
for each row execute function public.set_atualizado_em();

create or replace function public.validate_imovel_vigencia_dimensions()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_imobiliaria_id uuid;
  v_empreendimento_id uuid;
begin
  select imobiliaria_id, empreendimento_id
    into v_imobiliaria_id, v_empreendimento_id
  from public.imoveis
  where id = new.imovel_id;

  if v_imobiliaria_id is distinct from new.imobiliaria_id
     or v_empreendimento_id is distinct from new.empreendimento_id then
    raise exception
      'Dimensoes da vigencia nao correspondem ao imovel %',
      new.imovel_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_imovel_vigencia_dimensions() from public;

drop trigger if exists validate_imovel_vigencia_dimensions on public.imovel_vigencias;
create trigger validate_imovel_vigencia_dimensions
before insert or update of imovel_id, imobiliaria_id, empreendimento_id
on public.imovel_vigencias
for each row execute function public.validate_imovel_vigencia_dimensions();

alter table public.imovel_vigencias enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all privileges on table public.imovel_vigencias from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all privileges on table public.imovel_vigencias from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all privileges on table public.imovel_vigencias to service_role';
  end if;
end
$$;

-- Vigência inicial explícita para imóveis já cadastrados. O texto da fonte
-- deixa visível que a data inicial foi inferida do primeiro fechamento do par;
-- nenhum aluguel desconhecido é convertido em zero.
insert into public.imovel_vigencias (
  imovel_id,
  imobiliaria_id,
  empreendimento_id,
  vigencia_inicio,
  vigencia_fim,
  modelo_receita,
  aluguel_contratado,
  fonte
)
select
  i.id,
  i.imobiliaria_id,
  i.empreendimento_id,
  coalesce(
    (
      select min(f.competencia)
      from public.fechamentos f
      where f.imobiliaria_id = i.imobiliaria_id
        and f.empreendimento_id = i.empreendimento_id
    ),
    date_trunc('month', i.criado_em)::date
  ),
  null,
  case
    when lower(coalesce(i.tipo, '')) = 'airbnb' then 'variavel'
    else 'fixo'
  end,
  case
    when lower(coalesce(i.tipo, '')) = 'airbnb' then null
    else i.valor_aluguel_esperado
  end,
  'Cadastro de imóveis migrado; início inferido pelo primeiro fechamento conhecido'
from public.imoveis i
where i.ativo is true
  and not exists (
    select 1
    from public.imovel_vigencias v
    where v.imovel_id = i.id
      and v.ativo is true
  );

-- Fernando Rocha / AP0361 existiu até março. O seed só ocorre quando a
-- imobiliária Plural pode ser resolvida sem ID fixo. Valor desconhecido fica
-- nulo, nunca R$ 0,00.
do $$
declare
  v_imobiliaria_id uuid;
  v_empreendimento_id uuid;
  v_imovel_id uuid;
begin
  select id
    into v_imobiliaria_id
  from public.imobiliarias
  where public.acr_normalize_nome(nome) = public.acr_normalize_nome('Plural Imobiliária')
  order by ativo desc, criado_em asc
  limit 1;

  if v_imobiliaria_id is null then
    raise notice 'AP0361 não cadastrado: imobiliária Plural não encontrada.';
    return;
  end if;

  select id
    into v_empreendimento_id
  from public.empreendimentos
  where public.acr_normalize_nome(nome) = public.acr_normalize_nome('Fernando Rocha')
  order by ativo desc, criado_em asc
  limit 1;

  if v_empreendimento_id is null then
    insert into public.empreendimentos (nome, codigo, descricao, ativo)
    values (
      'Fernando Rocha',
      'FERNANDO_ROCHA',
      'Empreendimento histórico identificado nos fechamentos da Plural.',
      false
    )
    returning id into v_empreendimento_id;
  end if;

  select id
    into v_imovel_id
  from public.imoveis
  where imobiliaria_id = v_imobiliaria_id
    and empreendimento_id = v_empreendimento_id
    and public.acr_normalize_nome(regexp_replace(codigo_imobiliaria, '/.*$', ''))
      = public.acr_normalize_nome('AP0361')
  order by ativo desc, criado_em asc
  limit 1;

  if v_imovel_id is null then
    insert into public.imoveis (
      empreendimento_id,
      imobiliaria_id,
      codigo_imobiliaria,
      unidade,
      tipo,
      status,
      valor_aluguel_esperado,
      ativo,
      observacoes
    )
    values (
      v_empreendimento_id,
      v_imobiliaria_id,
      'AP0361',
      'AP0361',
      'apartamento',
      'inativo',
      null,
      false,
      'Imóvel histórico identificado nos fechamentos da Plural até 03/2026.'
    )
    returning id into v_imovel_id;
  end if;

  insert into public.imovel_vigencias (
    imovel_id,
    imobiliaria_id,
    empreendimento_id,
    vigencia_inicio,
    vigencia_fim,
    modelo_receita,
    aluguel_contratado,
    fonte,
    ativo
  )
  values (
    v_imovel_id,
    v_imobiliaria_id,
    v_empreendimento_id,
    '2026-01-01',
    '2026-03-01',
    'fixo',
    null,
    'Fechamentos históricos da Plural — AP0361',
    true
  )
  on conflict do nothing;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Snapshot v2 (colunas aditivas)
-- ---------------------------------------------------------------------------

alter table public.imovel_competencias
  add column if not exists aluguel_competencia numeric(14,2),
  add column if not exists atrasos_recuperados numeric(14,2),
  add column if not exists outros_recebimentos numeric(14,2),
  add column if not exists entradas_passagem numeric(14,2),
  add column if not exists saidas_passagem numeric(14,2),
  add column if not exists competencia_original date,
  add column if not exists competencia_recebimento date,
  add column if not exists dia_vencimento smallint,
  add column if not exists modelo_receita text,
  add column if not exists status_mensal_explicito text;

alter table public.imovel_competencias
  drop constraint if exists imovel_competencias_dia_vencimento_check,
  drop constraint if exists imovel_competencias_modelo_receita_check,
  drop constraint if exists imovel_competencias_status_mensal_explicito_check;

alter table public.imovel_competencias
  add constraint imovel_competencias_dia_vencimento_check
    check (dia_vencimento is null or dia_vencimento between 1 and 31),
  add constraint imovel_competencias_modelo_receita_check
    check (
      modelo_receita is null
      or modelo_receita in ('fixo', 'variavel', 'nao_aplicavel')
    ),
  add constraint imovel_competencias_status_mensal_explicito_check
    check (
      status_mensal_explicito is null
      or status_mensal_explicito in (
        'ocupado',
        'inadimplente',
        'vago',
        'em_rescisao',
        'desconhecido'
      )
    );

-- ---------------------------------------------------------------------------
-- 4. Canonização acento-insensível de imobiliárias
-- ---------------------------------------------------------------------------

create temporary table acr_imobiliaria_aliases as
with ranked as (
  select
    id,
    first_value(id) over (
      partition by public.acr_normalize_nome(nome)
      order by
        case
          when nome = 'Alive Imóveis' then 0
          else 1
        end,
        ativo desc,
        criado_em asc,
        id asc
    ) as canonical_id
  from public.imobiliarias
)
select id as alias_id, canonical_id
from ranked
where id <> canonical_id;

-- Regras sem colisão mudam para o canônico. Em colisões, a regra do alias fica
-- inativa para preservar a auditoria e deixar de compor indicadores.
update public.regras_comerciais r
set imobiliaria_id = a.canonical_id
from acr_imobiliaria_aliases a
where r.imobiliaria_id = a.alias_id
  and not exists (
    select 1
    from public.regras_comerciais canonical
    where canonical.imobiliaria_id = a.canonical_id
      and canonical.empreendimento_id = r.empreendimento_id
  );

update public.regras_comerciais r
set ativo = false
from acr_imobiliaria_aliases a
where r.imobiliaria_id = a.alias_id;

-- Relacionamentos operacionais são reapontados quando não há colisão de chave.
update public.fechamentos f
set imobiliaria_id = a.canonical_id
from acr_imobiliaria_aliases a
where f.imobiliaria_id = a.alias_id
  and not exists (
    select 1
    from public.fechamentos canonical
    where canonical.imobiliaria_id = a.canonical_id
      and canonical.empreendimento_id = f.empreendimento_id
      and canonical.competencia = f.competencia
  );

update public.imoveis i
set imobiliaria_id = a.canonical_id
from acr_imobiliaria_aliases a
where i.imobiliaria_id = a.alias_id
  and not exists (
    select 1
    from public.imoveis canonical
    where canonical.imobiliaria_id = a.canonical_id
      and canonical.empreendimento_id = i.empreendimento_id
      and (
        canonical.codigo_imobiliaria = i.codigo_imobiliaria
        or canonical.unidade = i.unidade
      )
  );

update public.acordos acordo
set imobiliaria_id = a.canonical_id
from acr_imobiliaria_aliases a
where acordo.imobiliaria_id = a.alias_id;

insert into public.egestor_imobiliaria_contatos (
  imobiliaria_id,
  conta_id,
  egestor_contato_id,
  criado_em,
  atualizado_em
)
select
  a.canonical_id,
  contato.conta_id,
  contato.egestor_contato_id,
  contato.criado_em,
  contato.atualizado_em
from public.egestor_imobiliaria_contatos contato
join acr_imobiliaria_aliases a on a.alias_id = contato.imobiliaria_id
on conflict (imobiliaria_id, conta_id) do update set
  egestor_contato_id = coalesce(
    public.egestor_imobiliaria_contatos.egestor_contato_id,
    excluded.egestor_contato_id
  );

delete from public.egestor_imobiliaria_contatos contato
using acr_imobiliaria_aliases a
where contato.imobiliaria_id = a.alias_id;

update public.imobiliarias
set ativo = false
where id in (select alias_id from acr_imobiliaria_aliases);

update public.imobiliarias
set ativo = true
where id in (select canonical_id from acr_imobiliaria_aliases);

-- Corrige a apresentação do cadastro canônico sem inventar um novo ID.
update public.imobiliarias
set nome = 'Alive Imóveis'
where id = (
  select id
  from public.imobiliarias
  where public.acr_normalize_nome(nome) = public.acr_normalize_nome('Alive Imóveis')
  order by ativo desc, criado_em asc
  limit 1
)
and nome <> 'Alive Imóveis'
and not exists (
  select 1
  from public.imobiliarias other
  where other.nome = 'Alive Imóveis'
);

drop table acr_imobiliaria_aliases;

-- ---------------------------------------------------------------------------
-- 5. Reparo idempotente e atômico dos fechamentos/snapshots
-- ---------------------------------------------------------------------------

create or replace function public.aplicar_reparo_indicadores_v2(
  p_fechamento_id uuid,
  p_esperado_atualizado_em timestamptz,
  p_fechamento_patch jsonb,
  p_receitas jsonb,
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
  v_receitas_inseridas integer := 0;
begin
  if jsonb_typeof(coalesce(p_receitas, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_auditoria, '[]'::jsonb)) <> 'array' then
    raise exception 'Receitas e auditoria devem ser arrays.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_auditoria, '[]'::jsonb)) = 0 then
    raise exception 'Todo reparo precisa registrar auditoria antes/depois.'
      using errcode = 'P0001';
  end if;

  select *
    into v_fechamento
  from public.fechamentos
  where id = p_fechamento_id
  for update;

  if not found then
    raise exception 'Fechamento não encontrado.' using errcode = 'P0002';
  end if;

  if p_esperado_atualizado_em is null
     or v_fechamento.atualizado_em <> p_esperado_atualizado_em then
    raise exception
      'O fechamento foi alterado por outra operação. Refaça o dry-run.'
      using errcode = '40001';
  end if;

  update public.fechamentos
  set
    analise_completa = case
      when p_fechamento_patch ? 'analise_completa'
        then p_fechamento_patch -> 'analise_completa'
      else analise_completa
    end,
    parecer_tecnico = case
      when p_fechamento_patch ? 'parecer_tecnico'
        then p_fechamento_patch -> 'parecer_tecnico'
      else parecer_tecnico
    end,
    total_receitas = case
      when p_fechamento_patch ? 'total_receitas'
        then nullif(p_fechamento_patch ->> 'total_receitas', '')::numeric
      else total_receitas
    end,
    total_despesas = case
      when p_fechamento_patch ? 'total_despesas'
        then nullif(p_fechamento_patch ->> 'total_despesas', '')::numeric
      else total_despesas
    end,
    total_comissoes = case
      when p_fechamento_patch ? 'total_comissoes'
        then nullif(p_fechamento_patch ->> 'total_comissoes', '')::numeric
      else total_comissoes
    end,
    total_repassar = case
      when p_fechamento_patch ? 'total_repassar'
        then nullif(p_fechamento_patch ->> 'total_repassar', '')::numeric
      else total_repassar
    end,
    valor_repassado_comprovante = case
      when p_fechamento_patch ? 'valor_repassado_comprovante'
        then nullif(
          p_fechamento_patch ->> 'valor_repassado_comprovante',
          ''
        )::numeric
      else valor_repassado_comprovante
    end,
    diferenca_total = case
      when p_fechamento_patch ? 'diferenca_total'
        then nullif(p_fechamento_patch ->> 'diferenca_total', '')::numeric
      else diferenca_total
    end,
    status = case
      when p_fechamento_patch ? 'status'
        then p_fechamento_patch ->> 'status'
      else status
    end,
    atualizado_em = now()
  where id = p_fechamento_id
  returning atualizado_em into v_atualizado_em;

  delete from public.movimentacoes
  where fechamento_id = p_fechamento_id
    and tipo_movimentacao = 'receita_aluguel';

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_receitas, '[]'::jsonb))
  loop
    if coalesce(v_item ->> 'tipo_movimentacao', 'receita_aluguel')
       <> 'receita_aluguel' then
      raise exception 'p_receitas aceita apenas receita_aluguel.'
        using errcode = '22023';
    end if;

    insert into public.movimentacoes (
      id,
      fechamento_id,
      documento_id,
      imovel_id,
      tipo_movimentacao,
      categoria,
      descricao,
      valor,
      sinal,
      data_competencia,
      origem_documental,
      confianca_extracao,
      status_validacao,
      corrigido_manualmente,
      dados_extraidos
    )
    values (
      coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid()),
      p_fechamento_id,
      nullif(v_item ->> 'documento_id', '')::uuid,
      nullif(v_item ->> 'imovel_id', '')::uuid,
      'receita_aluguel',
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
    v_receitas_inseridas := v_receitas_inseridas + 1;
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(p_auditoria)
  loop
    insert into public.auditoria_correcoes (
      fechamento_id,
      movimentacao_id,
      validacao_id,
      usuario,
      campo_alterado,
      valor_anterior,
      valor_novo,
      justificativa
    )
    values (
      p_fechamento_id,
      nullif(v_item ->> 'movimentacao_id', '')::uuid,
      nullif(v_item ->> 'validacao_id', '')::uuid,
      coalesce(nullif(v_item ->> 'usuario', ''), 'reparador-indicadores-v2'),
      v_item ->> 'campo_alterado',
      v_item ->> 'valor_anterior',
      v_item ->> 'valor_novo',
      v_item ->> 'justificativa'
    );
  end loop;

  return jsonb_build_object(
    'fechamento_id', p_fechamento_id,
    'atualizado_em', v_atualizado_em,
    'receitas_inseridas', v_receitas_inseridas
  );
end;
$$;

revoke all on function public.aplicar_reparo_indicadores_v2(
  uuid,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated;

grant execute on function public.aplicar_reparo_indicadores_v2(
  uuid,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) to service_role;
