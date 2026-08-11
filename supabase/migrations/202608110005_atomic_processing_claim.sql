create or replace function public.iniciar_processamento_fechamento(
  p_fechamento_id uuid,
  p_stuck_after_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_stuck_after_seconds < 60 then
    raise exception 'stuck timeout invalido';
  end if;

  update public.fechamentos
  set processamento_status = 'processando',
      processamento_progress = 2,
      processamento_evento = 'Iniciando análise',
      processamento_erro = null,
      processamento_iniciado_em = now(),
      processamento_atualizado_em = now()
  where id = p_fechamento_id
    and (
      processamento_status is distinct from 'processando'
      or processamento_atualizado_em is null
      or processamento_atualizado_em < now() - make_interval(secs => p_stuck_after_seconds)
    );

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.iniciar_processamento_fechamento(uuid, integer) from public, anon, authenticated;
grant execute on function public.iniciar_processamento_fechamento(uuid, integer) to service_role;
