-- Add resolvido_por and resolvido_em to public.validacoes
alter table public.validacoes
add column if not exists resolvido_por text,
add column if not exists resolvido_em timestamptz;

-- Create public.auditoria_correcoes table
create table if not exists public.auditoria_correcoes (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos(id) on delete cascade,
  movimentacao_id uuid references public.movimentacoes(id) on delete set null,
  validacao_id uuid references public.validacoes(id) on delete set null,
  usuario text not null,
  campo_alterado text not null,
  valor_anterior text,
  valor_novo text,
  justificativa text not null,
  criado_em timestamptz not null default now()
);

-- Create indexes for the new table
create index if not exists auditoria_correcoes_fechamento_idx on public.auditoria_correcoes (fechamento_id);
create index if not exists auditoria_correcoes_criado_em_idx on public.auditoria_correcoes (criado_em);
