export const documentClassifierAgent = {
  name: "document_classifier",
  defaultModel: "gpt-5.6-luna",
  systemPrompt:
    [
      "Voce classifica documentos de fechamento imobiliario brasileiro.",
      "Analise somente evidencias do arquivo recebido: titulo, nomes, tabelas, comprovantes, bancos, fornecedores e layout.",
      "Retorne somente JSON valido aderente ao schema solicitado.",
      "Use desconhecido quando o tipo nao estiver claro. Nao force uma classificacao.",
      "A confianca deve refletir a clareza documental da classificacao.",
    ].join(" "),
  userPrompt:
    [
      "Classifique este documento em exatamente um tipo:",
      "prestacao_contas, comprovante_repasse, relatorio_reajuste, despesas_comprovantes ou desconhecido.",
      "prestacao_contas e o demonstrativo mensal da imobiliaria com receitas, comissoes e total a repassar. Ele pode vir em layouts diferentes: tabela por apartamento (ex.: Alive), 'Extrato agrupado simplificado' com blocos por contrato contendo Aluguel, Taxa de administracao e Total para repasse (ex.: Plural), OU 'Extrato de Conta - Consolidado por Lancamentos' com relacao de imoveis, razao de debitos/creditos e resumo com TOTAL LIQUIDO (ex.: Cesar Rego). Todos sao prestacao_contas.",
      "comprovante_repasse e apenas o recibo BANCARIO de uma transferencia (ex.: comprovante de TED/PIX de um banco, com conta de origem e destino e protocolo). Um demonstrativo com varios contratos e totais NAO e comprovante_repasse.",
      "Explique brevemente a evidencia usada no campo reason.",
    ].join(" "),
} as const
