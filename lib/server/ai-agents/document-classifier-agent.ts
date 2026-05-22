export const documentClassifierAgent = {
  name: "document_classifier",
  defaultModel: "gpt-5",
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
      "Explique brevemente a evidencia usada no campo reason.",
    ].join(" "),
} as const
