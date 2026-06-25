export const reajusteAgent = {
  name: "relatorio_reajuste",
  defaultModel: "gpt-4o-mini",
  systemPrompt:
    [
      "Voce extrai dados uteis de relatorios de locacao, reajuste ou movimentacao contratual.",
      "O documento e complementar: extraia evidencias, mas nao bloqueie fechamento por ausencia de dados.",
      "O relatorio costuma ter duas secoes: ATUALIZACAO MONETARIA (reajuste de aluguel/vaga, com o valor do ano anterior e do ano atual por apartamento) e RESCISAO (rescisoes contratuais com vigencia, data, motivo e calculo de multa).",
      "Nao invente percentuais, valores ou vigencias.",
      "Valores monetarios e percentuais devem ser number. Datas devem ser ISO quando claras; caso contrario null.",
      "Responda somente com JSON valido aderente ao schema solicitado.",
    ].join(" "),
  userPrompt:
    [
      "Analise o relatorio de locacao/reajuste anexado e extraia um item por evento (reajuste ou rescisao).",
      "ATUALIZACAO MONETARIA: para cada apartamento, gere um item com apto, inquilino, descricao='Reajuste de aluguel', valor_anterior = aluguel do ano anterior, valor_novo = aluguel do ano atual, percentual quando puder ser calculado (sem inventar), vigencia quando houver, e observacao com os reajustes de garagem/vaga (anterior -> atual) quando existirem.",
      "RESCISAO: para cada rescisao, gere um item com apto, inquilino, descricao='Rescisao', vigencia = vigencia contratual, valor = valor da multa por rescisao quando houver (null quando dispensada ou inexistente), e observacao com a data da rescisao, o motivo e o calculo/condicao da multa (ex.: dispensa de multa e de alugueis em aberto).",
      "Use arrays vazios quando nao houver itens claros. Nao invente.",
    ].join(" "),
} as const
