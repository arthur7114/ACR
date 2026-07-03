export type LogEntry = {
  id: string
  tipo: "correcao" | "notificacao"
  titulo: string
  detalhe: string
  quando: string
}

type CorrecaoRow = {
  id: string
  campo: string
  valor_anterior: string | null
  valor_novo: string
  corrigido_pelo: string
  motivo: string
  criado_em: string
}

type NotificacaoRow = {
  id: string
  tipo: string
  titulo: string
  corpo: string
  criado_em: string
}

export function mesclarLogs(correcoes: CorrecaoRow[], notificacoes: NotificacaoRow[]): LogEntry[] {
  const deCorrecoes: LogEntry[] = correcoes.map((c) => ({
    id: c.id,
    tipo: "correcao",
    titulo: `Correção manual: ${c.campo}`,
    detalhe: `${c.campo}: ${c.valor_anterior ?? "-"} → ${c.valor_novo} · por ${c.corrigido_pelo} · motivo: ${c.motivo}`,
    quando: c.criado_em,
  }))
  const deNotificacoes: LogEntry[] = notificacoes.map((n) => ({
    id: n.id,
    tipo: "notificacao",
    titulo: n.titulo,
    detalhe: n.corpo,
    quando: n.criado_em,
  }))
  return [...deCorrecoes, ...deNotificacoes].sort((a, b) => (a.quando < b.quando ? 1 : -1))
}
