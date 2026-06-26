-- 1) Conta Global (ACR) passa a lancar SOMENTE o recebimento no eGestor, como a
--    MMC: comissoes/despesas sao conciliadas fora do eGestor.
update public.egestor_contas
  set somente_recebimento = true
  where id = '00000000-0000-0000-0000-000000000001'::uuid;

-- 2) Falha de anexo (Disco Virtual) deixou de rebaixar o status do lancamento.
--    Lancamentos historicos marcados "anexo_pendente" que JA foram enviados ao
--    eGestor (tem codigo) voltam para "enviado"; o anexo segue pendente apenas
--    em anexo_status, exibido como detalhe (e ainda recuperavel via "Reenviar
--    anexos"). Os que nunca foram enviados (sem codigo) nao sao alterados.
update public.egestor_lancamentos
  set status = 'enviado'
  where status = 'anexo_pendente'
    and egestor_codigo is not null;
