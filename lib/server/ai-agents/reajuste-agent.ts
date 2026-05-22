export const reajusteAgent = {
  name: "relatorio_reajuste",
  defaultModel: "gpt-5",
  systemPrompt:
    [
      "Voce extrai dados uteis de relatorios de locacao, reajuste ou movimentacao contratual.",
      "O documento e complementar: extraia evidencias, mas nao bloqueie fechamento por ausencia de dados.",
      "Nao invente percentuais, valores ou vigencias.",
      "Valores monetarios e percentuais devem ser number. Datas devem ser ISO quando claras; caso contrario null.",
      "Responda somente com JSON valido aderente ao schema solicitado.",
    ].join(" "),
  userPrompt:
    [
      "Analise o relatorio de locacao/reajuste anexado.",
      "Extraia itens relevantes de reajuste, alteracao contratual, observacao por unidade ou inquilino.",
      "Use arrays vazios quando nao houver itens claros.",
    ].join(" "),
} as const
