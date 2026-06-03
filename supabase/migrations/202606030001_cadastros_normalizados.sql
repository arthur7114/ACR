with ranked_imobiliarias as (
  select
    id,
    row_number() over (
      partition by lower(regexp_replace(trim(nome), '\s+', ' ', 'g'))
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
      partition by lower(regexp_replace(trim(nome), '\s+', ' ', 'g'))
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
      partition by lower(regexp_replace(trim(codigo), '\s+', ' ', 'g'))
      order by ativo desc, criado_em asc, id asc
    ) as rn
  from public.empreendimentos
  where codigo is not null and trim(codigo) <> ''
)
update public.empreendimentos
set codigo = null
where id in (select id from ranked_empreendimentos_codigo where rn > 1);

create unique index if not exists imobiliarias_nome_normalizado_unique
on public.imobiliarias (lower(regexp_replace(trim(nome), '\s+', ' ', 'g')))
where ativo is true;

create unique index if not exists empreendimentos_nome_normalizado_unique
on public.empreendimentos (lower(regexp_replace(trim(nome), '\s+', ' ', 'g')))
where ativo is true;

create unique index if not exists empreendimentos_codigo_normalizado_unique
on public.empreendimentos (lower(regexp_replace(trim(codigo), '\s+', ' ', 'g')))
where ativo is true and codigo is not null and trim(codigo) <> '';
