-- Prazo do contrato de locação no cadastro do imóvel: início e término
-- previsto, com o dia (pedido do cliente em 2026-10-02, planilha CADASTRO
-- INQUILINOS + relatório de vigência).
--
-- Não substitui `contratos_locacao` nem `imovel_vigencias`: aqueles têm grão de
-- mês e descrevem o que os fechamentos comprovaram para os Indicadores. Estas
-- colunas guardam o que o contrato assinado declara e não entram em nenhum
-- cálculo financeiro.
--
-- `contrato_locatario` amarra o prazo a quem assinou: quando a aprovação de um
-- fechamento troca `inquilino_nome`, as datas antigas deixam de valer para a
-- unidade (a tela mostra "outro inquilino") até um documento trazer as novas.

alter table public.imoveis
  add column if not exists contrato_inicio date,
  add column if not exists contrato_termino date,
  add column if not exists contrato_locatario text,
  add column if not exists contrato_fonte text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'imoveis_contrato_intervalo_check'
  ) then
    alter table public.imoveis
      add constraint imoveis_contrato_intervalo_check
      check (contrato_inicio is null or contrato_termino is null or contrato_termino >= contrato_inicio);
  end if;
end
$$;

comment on column public.imoveis.contrato_inicio is 'Início do contrato de locação vigente (data do contrato, não competência).';
comment on column public.imoveis.contrato_termino is 'Término previsto do contrato vigente. Vencido com inquilino na unidade = provável prorrogação.';
comment on column public.imoveis.contrato_locatario is 'Locatário a quem as datas pertencem; diferente de inquilino_nome = datas de outro contrato.';
comment on column public.imoveis.contrato_fonte is 'De onde vieram as datas: planilha, relatório de vigência (com competência) ou edição manual.';
