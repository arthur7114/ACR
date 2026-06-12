-- Permite "ocultar" um fechamento sem exclui-lo (soft-hide), separado do status
-- operacional. A exclusao definitiva continua sendo um DELETE (cascateia
-- documentos/movimentacoes/validacoes/egestor via ON DELETE CASCADE).
alter table public.fechamentos
  add column if not exists arquivado boolean not null default false;

create index if not exists fechamentos_arquivado_idx on public.fechamentos (arquivado);
