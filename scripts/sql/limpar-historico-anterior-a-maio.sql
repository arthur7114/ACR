-- Limpeza do histórico anterior a maio/2026 (decisão da reunião de 27/08/2026).
--
-- ATENÇÃO: esta operação APAGA DADOS DE FORMA DEFINITIVA. Antes de executar:
--   1. Faça backup lógico do banco (Supabase > Database > Backups, ou pg_dump).
--   2. Rode a PARTE 1 e confira as contagens.
--   3. Só então rode a PARTE 2, que está dentro de uma transação única.
--
-- Escopo aferido em 28/08/2026 (somente leitura):
--   fechamentos < maio ......... 37   (25 permanecem)
--   imovel_competencias ........ 476  (355 permanecem)
--   movimentacoes .............. 423
--   validacoes ................. 362
--   documentos_fechamento ...... 74
--   fechamento_status_eventos .. 1
--   egestor_lancamentos ........ 0    (nenhum lançamento enviado é afetado)
--
-- NÃO cobre os arquivos no Storage: as 74 linhas de documentos_fechamento
-- apontam para objetos no bucket, que continuarão lá. Apagar os binários é
-- decisão separada — sem eles, o histórico remanescente perde a fonte.

-- ============================ PARTE 1 — CONFERÊNCIA ============================
-- Rode isto primeiro e confira se os números batem com o esperado.

select 'fechamentos a apagar' as item, count(*) as linhas
  from public.fechamentos where competencia < '2026-05-01'
union all select 'fechamentos que permanecem', count(*)
  from public.fechamentos where competencia >= '2026-05-01'
union all select 'imovel_competencias a apagar', count(*)
  from public.imovel_competencias where competencia < '2026-05-01'
union all select 'movimentacoes a apagar', count(*)
  from public.movimentacoes m
  join public.fechamentos f on f.id = m.fechamento_id
  where f.competencia < '2026-05-01'
union all select 'validacoes a apagar', count(*)
  from public.validacoes v
  join public.fechamentos f on f.id = v.fechamento_id
  where f.competencia < '2026-05-01'
union all select 'documentos_fechamento a apagar', count(*)
  from public.documentos_fechamento d
  join public.fechamentos f on f.id = d.fechamento_id
  where f.competencia < '2026-05-01'
union all select 'lancamentos eGestor afetados (deve ser 0)', count(*)
  from public.egestor_lancamentos l
  join public.fechamentos f on f.id = l.fechamento_id
  where f.competencia < '2026-05-01';

-- ============================ PARTE 2 — EXECUÇÃO ==============================
-- Transação única: ou tudo é apagado, ou nada é. Aborta se encontrar algum
-- lançamento já enviado ao eGestor no escopo.

begin;

do $$
declare
  v_enviados integer;
begin
  select count(*) into v_enviados
  from public.egestor_lancamentos l
  join public.fechamentos f on f.id = l.fechamento_id
  where f.competencia < '2026-05-01' and l.egestor_codigo is not null;

  if v_enviados > 0 then
    raise exception 'Abortado: % lançamento(s) já enviado(s) ao eGestor no escopo da limpeza.', v_enviados;
  end if;
end $$;

create temporary table _fechamentos_antigos on commit drop as
  select id from public.fechamentos where competencia < '2026-05-01';

delete from public.imovel_competencias where competencia < '2026-05-01';
delete from public.validacoes           where fechamento_id in (select id from _fechamentos_antigos);
delete from public.movimentacoes        where fechamento_id in (select id from _fechamentos_antigos);
delete from public.documentos_fechamento where fechamento_id in (select id from _fechamentos_antigos);
delete from public.fechamento_status_eventos where fechamento_id in (select id from _fechamentos_antigos);
delete from public.egestor_lancamentos  where fechamento_id in (select id from _fechamentos_antigos);
delete from public.fechamentos          where id in (select id from _fechamentos_antigos);

-- Conferência dentro da transação: nada anterior a maio deve restar.
do $$
declare
  v_resto integer;
begin
  select count(*) into v_resto from public.fechamentos where competencia < '2026-05-01';
  if v_resto > 0 then
    raise exception 'Abortado: ainda restam % fechamento(s) anteriores a maio.', v_resto;
  end if;
  select count(*) into v_resto from public.imovel_competencias where competencia < '2026-05-01';
  if v_resto > 0 then
    raise exception 'Abortado: ainda restam % snapshot(s) anteriores a maio.', v_resto;
  end if;
end $$;

commit;
