# 04 - User Flows

## Criar fechamento

Entrada: imobiliaria, empreendimento, competencia e observacoes opcionais.

Resultado esperado: fechamento criado em `rascunho`, unico por imobiliaria + empreendimento + competencia.

## Upload e classificacao

O usuario envia PDF, XLSX, CSV, PNG, JPG, JPEG ou WEBP. O sistema salva o arquivo original, gera hash e tenta classificar automaticamente.

Confianca menor que 0,80 fica como `desconhecido`, bloqueia o processamento
financeiro daquele documento e exige classificacao/reenvio consciente antes de
continuar. O pipeline nunca encaminha silenciosamente uma classificacao incerta
ao extrator de outro tipo.

## Processamento inicial

Etapas:

1. salvar arquivos originais;
2. extrair texto, tabelas ou imagens via Claude API;
3. identificar layout e imobiliaria;
4. aplicar parser versionado;
5. normalizar para o modelo canonico;
6. salvar movimentacoes e comprovantes;
7. executar validacoes deterministicas;
8. calcular diferencas;
9. atualizar status;
10. notificar o usuario.

Timeout por documento: 5 minutos. Falha nao deve corromper o fechamento; reprocessamento continua disponivel.

## Remessa adicional

Disponivel enquanto o fechamento nao estiver `aprovado` ou `lancado_egestor`.

Fluxo:

1. usuario clica em "Adicionar documentos" na revisao;
2. envia novos arquivos;
3. sistema classifica os novos documentos;
4. usuario clica em "Processar documentos adicionados";
5. status muda para `reprocessando_parcial`;
6. pipeline processa apenas os novos documentos;
7. merge integra novas extracoes sem sobrescrever correcoes manuais;
8. validacoes rodam sobre o conjunto completo;
9. usuario recebe notificacao.

Cada lote novo recebe `remessa_numero` crescente. Arquivos já processados no
mesmo fechamento são identificados por SHA-256 e não voltam a compor os totais;
comprovantes parciais distintos são somados, despesas/reajustes são unidos sem
duplicação literal e uma prestação nova substitui a anterior. A troca de totais,
movimentações, validações e snapshots é atômica e preserva linhas corrigidas
manualmente.

## Revisao e correcao

A revisao deve exibir resumo financeiro operacional no topo, receitas por imovel, acordos/rescisoes recebidos no mes, despesas e comprovantes, comprovante de repasse, divergencias, documentos anexados e historico.

Cada receita exibe a competência original extraída do documento em `MM/AAAA` (somente leitura), com destaque quando é anterior ao mês do recebimento. Ausência aparece como “-”; referências de IPTU ou dia isolado não preenchem a competência e a coluna não é editável na tabela.

Despesas são desdobradas por categoria no topo. O operador abre cada grupo por mouse, teclado ou toque para ver descrição completa, referência e valor.

Quando houver receita sem imóvel vinculado, um banner abre o drawer de resolução. O operador busca um cadastro existente ou cria um novo, compara diferenças e escolhe explicitamente qualquer atualização; o fluxo avança uma receita por vez e mostra progresso.

Leitura tecnica do documento e documentos processados ficam colapsados no fim da revisao.

Correcoes manuais exigem log com usuario, campo, valor anterior, valor novo, data/hora e justificativa.

Correção de competência e vínculo é atômica: análise, movimentação, validações, eventual cadastro e auditoria confirmam juntas ou nenhuma alteração é mantida.

Resolver pendencia exige uma validacao persistida; quando a linha ainda nao existe no banco, a interface deve orientar atualizar/reprocessar em vez de chamar a resolucao com id vazio.

Documentos opcionais ausentes não entram na fila de pendências. Quando nenhuma despesa é identificada, R$ 0,00 passa silenciosamente; registros legados equivalentes permanecem na auditoria, mas não aparecem na lista operacional.

## Aprovacao e eGestor

Aprovacao exige:

- nenhuma divergencia bloqueante aberta;
- comprovante de repasse conciliado ou justificado;
- despesas criticas conciliadas ou justificadas.
- toda receita de aluguel positiva possui competência original válida;
- toda receita possui `imovel_id` persistido e compatível com o fechamento.

Depois de aprovado, o sistema gera previa de lancamentos para o eGestor. A V1 usa lancamento automático consolidado por fechamento: repasse mensal como recebimento, comissao/despesas como pagamentos separados. O operador pode acrescentar várias linhas manuais com o mesmo tipo/categoria; elas permanecem ao regenerar a prévia. O envio real so ocorre por acao explicita do operador e fica bloqueado quando ha pendencia, configuracao incompleta ou lancamento ja enviado.

No layout César Rêgo, a geração usa somente as linhas do empreendimento do fechamento. A TED global é dividida igualmente entre os empreendimentos. As validações determinísticas são regeneradas após o recorte, antes da persistência. O vencimento informado no cabeçalho alimenta as datas do recebimento quando não existe comprovante externo.

Depois do envio, a revisao permite revalidar os codigos ja gravados no eGestor sem reenviar financeiro. Quando anexos falham, o operador pode reenviar apenas anexos pendentes; falha nesse retry mantem o lancamento financeiro preservado e atualiza a mensagem operacional.

A revisao tambem mostra os ultimos eventos tecnicos da integracao (`send`, `retry_anexo`, `revalidar_status`) e as transicoes de status do fechamento para auditoria.
