create table if not exists public.imovel_competencias (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references public.imoveis(id) on delete cascade,
  fechamento_id uuid not null references public.fechamentos(id) on delete cascade,
  competencia date not null,
  status_ocupacao text not null,
  status_origem text not null,
  inquilino_nome text,
  aluguel_esperado numeric(14,2),
  aluguel_esperado_origem text,
  aluguel_recebido numeric(14,2),
  receita_total numeric(14,2),
  desconto numeric(14,2),
  comissao_administracao numeric(14,2),
  repasse_apurado numeric(14,2),
  vencimento_referencia text,
  quantidade_linhas integer not null default 0,
  origem text not null,
  qualidade text not null,
  calculo_versao text not null,
  checksum text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint imovel_competencias_status_ocupacao_check
    check (status_ocupacao in ('ocupado', 'inadimplente', 'vago', 'em_rescisao', 'desconhecido')),
  constraint imovel_competencias_origem_check
    check (origem in ('processamento', 'backfill')),
  constraint imovel_competencias_qualidade_check
    check (qualidade in ('completo', 'parcial', 'sem_linha')),
  constraint imovel_competencias_imovel_competencia_unique
    unique (imovel_id, competencia)
);

create index if not exists imovel_competencias_competencia_idx
  on public.imovel_competencias (competencia);

create index if not exists imovel_competencias_fechamento_idx
  on public.imovel_competencias (fechamento_id);

create index if not exists imovel_competencias_imovel_competencia_idx
  on public.imovel_competencias (imovel_id, competencia desc);

create trigger set_imovel_competencias_atualizado_em
before update on public.imovel_competencias
for each row execute function public.set_atualizado_em();
