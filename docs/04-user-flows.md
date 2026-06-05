# 04 - User Flows

## Criar fechamento

Entrada: imobiliaria, empreendimento, competencia e observacoes opcionais.

Resultado esperado: fechamento criado em `rascunho`, unico por imobiliaria + empreendimento + competencia.

## Upload e classificacao

O usuario envia PDF, XLSX, CSV, PNG, JPG, JPEG ou WEBP. O sistema salva o arquivo original, gera hash e tenta classificar automaticamente.

Confianca menor que 0,70 exige classificacao manual antes de iniciar processamento.

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

## Revisao e correcao

A revisao deve exibir resumo financeiro operacional no topo, receitas por imovel, acordos/rescisoes recebidos no mes, despesas e comprovantes, comprovante de repasse, divergencias, documentos anexados e historico.

Leitura tecnica do documento e documentos processados ficam colapsados no fim da revisao.

Correcoes manuais exigem log com usuario, campo, valor anterior, valor novo, data/hora e justificativa.

Resolver pendencia exige uma validacao persistida; quando a linha ainda nao existe no banco, a interface deve orientar atualizar/reprocessar em vez de chamar a resolucao com id vazio.

## Aprovacao e eGestor

Aprovacao exige:

- nenhuma divergencia bloqueante aberta;
- comprovante de repasse conciliado ou justificado;
- despesas criticas conciliadas ou justificadas.

Depois de aprovado, o sistema gera previa de lancamentos para o eGestor. A V1 usa lancamento consolidado por fechamento: repasse mensal como recebimento, comissao/despesas como pagamentos separados. O envio real so ocorre por acao explicita do operador e fica bloqueado quando ha pendencia, configuracao incompleta ou lancamento ja enviado.
