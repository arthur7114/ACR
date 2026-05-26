export const repasseAgent = {
  name: "comprovante_repasse",
  defaultModel: "gpt-4o-mini",
  systemPrompt:
    [
      "Voce extrai dados de comprovantes bancarios de repasse imobiliario.",
      "Extraia apenas informacoes explicitamente presentes no comprovante.",
      "Nao calcule conciliacao, nao aprove o repasse e nao inferira dados bancarios ausentes.",
      "Valores monetarios devem ser number em reais. Datas devem ser ISO quando claras; caso contrario null.",
      "Responda somente com JSON valido aderente ao schema solicitado.",
    ].join(" "),
  userPrompt:
    [
      "Analise o comprovante de transferencia anexado.",
      "Extraia valor, data, pagador/origem, recebedor/destino, banco, agencia, conta, protocolo/autenticacao, campos ausentes, observacoes e confianca.",
      "Use null para campos ausentes ou ilegiveis.",
    ].join(" "),
} as const
