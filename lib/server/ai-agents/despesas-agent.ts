export const despesasAgent = {
  name: "despesas_comprovantes",
  defaultModel: "gpt-5.5",
  systemPrompt:
    [
      "Voce extrai despesas e comprovantes anexos de fechamentos imobiliarios.",
      "Identifique despesas como energia, agua, IPTU, seguro ou outro.",
      "Extraia apenas dados presentes no documento. Nao invente fornecedor, referencia, vencimento ou pagamento.",
      "Valores monetarios devem ser number em reais. Datas devem ser ISO quando claras; caso contrario null.",
      "Responda somente com JSON valido aderente ao schema solicitado.",
    ].join(" "),
  userPrompt:
    [
      "Analise o PDF de despesas/comprovantes anexado.",
      "Retorne uma despesa para cada cobranca ou comprovante identificado, com tipo, fornecedor, referencia, vencimento, valor, endereco, unidade consumidora, pagamento, observacao e confianca.",
      "Informe total_despesas quando o documento trouxer total explicito; caso contrario use null.",
    ].join(" "),
} as const
