-- Normalizacao de cadastros INSENSIVEL A ACENTOS.
--
-- Problema: os indices/dedup anteriores usavam lower(regexp_replace(trim(nome)))
-- que NAO remove acentos. Assim "Galpao Pompilio Gomes" e "Galpao Pompilio Gomes"
-- com acento ("Galpão...") sobreviviam como duas linhas ativas e apareciam
-- duplicadas no dropdown de empreendimentos. A aplicacao ja normaliza acentos em
-- normalizeCadastroKey (NFD + remocao de marcas), mas o banco nao acompanhava.
--
-- Esta migration cria uma funcao IMMUTABLE que espelha normalizeCadastroKey
-- (lower + trim + colapsar espacos + remover acentos via translate), desativa as
-- duplicatas remanescentes (sem deletar, preservando FKs de fechamentos) e
-- recria os indices unicos usando a funcao.

create or replace function public.acr_normalize_nome(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    trim(
      translate(
        lower(coalesce(value, '')),
        'áàâãäåçéèêëíìîïñóòôõöúùûüýÿ',
        'aaaaaaceeeeiiiinooooouuuuyy'
      )
    ),
    '\s+', ' ', 'g'
  )
$$;

-- Remove os indices antigos (que nao normalizavam acentos) antes do dedup.
drop index if exists public.imobiliarias_nome_normalizado_unique;
drop index if exists public.empreendimentos_nome_normalizado_unique;
drop index if exists public.empreendimentos_codigo_normalizado_unique;

-- Dedup por nome (acento-insensivel), mantendo a linha ativa mais antiga.
with ranked_imobiliarias as (
  select
    id,
    row_number() over (
      partition by public.acr_normalize_nome(nome)
      order by ativo desc, criado_em asc, id asc
    ) as rn
  from public.imobiliarias
)
update public.imobiliarias
set ativo = false
where id in (select id from ranked_imobiliarias where rn > 1);

with ranked_empreendimentos_nome as (
  select
    id,
    row_number() over (
      partition by public.acr_normalize_nome(nome)
      order by ativo desc, criado_em asc, id asc
    ) as rn
  from public.empreendimentos
)
update public.empreendimentos
set ativo = false
where id in (select id from ranked_empreendimentos_nome where rn > 1);

with ranked_empreendimentos_codigo as (
  select
    id,
    row_number() over (
      partition by public.acr_normalize_nome(codigo)
      order by ativo desc, criado_em asc, id asc
    ) as rn
  from public.empreendimentos
  where codigo is not null and trim(codigo) <> ''
)
update public.empreendimentos
set codigo = null
where id in (select id from ranked_empreendimentos_codigo where rn > 1);

-- Recria os indices unicos com normalizacao acento-insensivel.
create unique index if not exists imobiliarias_nome_normalizado_unique
on public.imobiliarias (public.acr_normalize_nome(nome))
where ativo is true;

create unique index if not exists empreendimentos_nome_normalizado_unique
on public.empreendimentos (public.acr_normalize_nome(nome))
where ativo is true;

create unique index if not exists empreendimentos_codigo_normalizado_unique
on public.empreendimentos (public.acr_normalize_nome(codigo))
where ativo is true and codigo is not null and trim(codigo) <> '';
