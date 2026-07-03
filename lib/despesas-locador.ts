import type { PrestacaoAnalysis, PrestacaoResumoDespesa } from "@/lib/prestacao-types"

// Só comissão de administração e intermediação têm baldes próprios; todo o resto
// (TED/PIX, desconto, reembolso, utilidades) é despesa do locador (ADR-0001).
// "intermedia" é checado ANTES de "comiss" porque "comissão de intermediação"
// pertence ao balde de intermediação.
export type CategoriaLancamento = "comissao" | "intermediacao" | "despesa"

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

export function classificarLancamento(descricao: string): CategoriaLancamento {
  const t = normalizar(descricao)
  if (/intermedia/.test(t)) return "intermediacao"
  if (/comiss/.test(t)) return "comissao"
  return "despesa"
}
