# 06 - Acceptance Criteria

## Etapa 1 - App vivo sem IA

- CA01: dado imobiliaria, empreendimento e competencia, o sistema cria fechamento em `rascunho`.
- CA02: dado upload de arquivos, o sistema armazena, gera hash e vincula ao fechamento com `remessa_numero = 1`.
- CA03 parcial: documentos podem ser classificados manualmente quando a automatica nao estiver disponivel.
- CA09 parcial: usuario visualiza a tela de revisao com dados persistidos.
- CA12 parcial: correcoes manuais geram registro de auditoria.

## Etapa 2 - Extracao basica

- CA03: pacote Alive / GM II identifica prestacao, comprovante de repasse, relatorio de reajuste e despesas/comprovantes.
- CA04 parcial: secao 1 da prestacao GM II e extraida por apartamento.
- CA05: comprovante bancario extrai valor, data, pagador, recebedor e protocolo.
- CA07 parcial: repasse e prestacao sao conciliados quando valor e janela forem compativeis.
- CA08: divergencia de repasse gera alerta com severidade correta.
- CA13 parcial: remessa adicional processa documentos novos sem apagar dados anteriores.

## Etapa 3 - Extracao completa e aprovacao

- CA04 completo: prestacao GM II extrai secoes 1, 2, 3 e 4.
- CA06: despesas Alive extraem ENEL, CAGECE, IPTU, seguros e comprovantes.
- CA07: despesas e comprovantes conciliam por valor, beneficiario e janela de data.
- CA10: aprovacao e bloqueada quando ha divergencia bloqueante aberta.
- CA10.1: possivel acordo/rescisao repetido bloqueia aprovacao ate resolucao ou justificativa.
- CA11: notificacao in-app chega em ate 30 segundos apos conclusao ou bloqueante.
- CA12 completo: toda correcao manual registra usuario, campo, valores, data/hora e justificativa.
- CA12.1: resolucao de pendencia salva o valor oficial escolhido pelo operador e nunca chama a API com id de validacao vazio.
- CA14: fechamento apenas com comprovante de repasse bloqueia aprovacao por prestacao ausente.

## Etapa 4 - Futuro

- CA15: configuracao eGestor deve permitir token, teste de conexao, conta disponivel padrao, contato/tag por imobiliaria, tag por empreendimento e plano de contas por categoria.
- CA16: previa eGestor deve listar lancamentos, categorias, tags, contas, descricoes, valores e status de validacao.
- CA17: envio real ao eGestor so deve ocorrer apos fechamento aprovado, previa validada e confirmacao explicita do operador.
- CA18: envio deve ser idempotente; fechamento com codigo eGestor salvo nao pode reenviar os mesmos lancamentos.
- CA19: falha de anexo nao desfaz lancamento financeiro; o item fica marcado como anexo pendente para retry futuro.
