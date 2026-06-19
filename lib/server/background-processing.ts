import { createSupabaseAdmin } from "./supabase"
import { runPackageWorkflowWithEvents } from "./package-workflow"
import type { FechamentoContext } from "@/lib/fechamento-context"
import type { ProcessingEvent } from "@/lib/prestacao-types"

// Job considerado travado apos este tempo sem atualizacao (server restart no meio etc.).
const STUCK_AFTER_MS = 15 * 60 * 1000

// Rotulo curto e amigavel por evento, para o snapshot de progresso exibido na UI.
function eventoLabel(event: ProcessingEvent): string {
  switch (event.type) {
    case "workflow_started":
      return "Iniciando análise"
    case "document_classified":
      return `Classificando documentos${event.fileName ? ` — ${event.fileName}` : ""}`
    case "extraction_started":
      return `Extraindo dados${event.fileName ? ` — ${event.fileName}` : ""}`
    case "extraction_completed":
      return `Extração concluída${event.fileName ? ` — ${event.fileName}` : ""}`
    case "validation_started":
      return "Validando os números"
    case "validation_completed":
      return "Validação concluída"
    case "file_saved":
      return "Salvando documentos"
    case "persistence_completed":
      return "Finalizando"
    case "workflow_completed":
      return "Análise concluída"
    case "workflow_failed":
      return "Falha na análise"
    default:
      return event.message
  }
}

// Ha um job de processamento ativo (e nao travado) para este fechamento?
export async function isProcessingActive(fechamentoId: string): Promise<boolean> {
  const supabase = createSupabaseAdmin()
  const { data } = await supabase
    .from("fechamentos")
    .select("processamento_status, processamento_atualizado_em")
    .eq("id", fechamentoId)
    .maybeSingle()

  if (!data || data.processamento_status !== "processando") return false
  const updated = data.processamento_atualizado_em ? new Date(data.processamento_atualizado_em).getTime() : 0
  return updated > 0 && Date.now() - updated < STUCK_AFTER_MS
}

// Dispara o workflow DESTACADO do request: marca 'processando', e a promise interna
// segue rodando depois que o handler responde (Node persistente / EasyPanel). Vai
// gravando o progresso no banco e, ao concluir/falhar, fecha o status e notifica.
export async function startPackageProcessingInBackground(
  files: File[],
  context: FechamentoContext,
): Promise<void> {
  const supabase = createSupabaseAdmin()
  const nowIso = new Date().toISOString()

  await supabase
    .from("fechamentos")
    .update({
      processamento_status: "processando",
      processamento_progress: 2,
      processamento_evento: "Iniciando análise",
      processamento_erro: null,
      processamento_iniciado_em: nowIso,
      processamento_atualizado_em: nowIso,
    })
    .eq("id", context.id)

  // fire-and-forget: NAO await aqui — a conexao do cliente pode cair sem matar o job.
  void runAndTrack(files, context).catch(async (error) => {
    const message = error instanceof Error ? error.message : "Falha desconhecida no processamento."
    await markErro(context, message)
  })
}

async function runAndTrack(files: File[], context: FechamentoContext): Promise<void> {
  const supabase = createSupabaseAdmin()

  for await (const event of runPackageWorkflowWithEvents(files, context)) {
    if (event.type === "workflow_completed") {
      // A persistencia (analise_completa + status do fechamento) ja aconteceu dentro
      // do workflow; aqui so fechamos o snapshot de progresso e notificamos.
      await supabase
        .from("fechamentos")
        .update({
          processamento_status: "concluido",
          processamento_progress: 100,
          processamento_evento: "Análise concluída",
          processamento_erro: null,
          processamento_atualizado_em: new Date().toISOString(),
        })
        .eq("id", context.id)
      await criarNotificacao(context, "analise_concluida")
      return
    }

    if (event.type === "workflow_failed") {
      await markErro(context, event.error ?? event.message)
      return
    }

    await supabase
      .from("fechamentos")
      .update({
        processamento_progress: Math.min(99, Math.max(0, Math.round(event.progress ?? 0))),
        processamento_evento: eventoLabel(event),
        processamento_atualizado_em: new Date().toISOString(),
      })
      .eq("id", context.id)
  }
}

async function markErro(context: FechamentoContext, message: string): Promise<void> {
  const supabase = createSupabaseAdmin()
  await supabase
    .from("fechamentos")
    .update({
      processamento_status: "erro",
      processamento_evento: "Falha na análise",
      processamento_erro: message,
      processamento_atualizado_em: new Date().toISOString(),
    })
    .eq("id", context.id)
  await criarNotificacao(context, "analise_falhou", message)
}

async function criarNotificacao(
  context: FechamentoContext,
  tipo: "analise_concluida" | "analise_falhou",
  detalhe?: string,
): Promise<void> {
  const supabase = createSupabaseAdmin()
  const escopo = `${context.imobiliariaNome} · ${context.empreendimentoNome}`
  const titulo = tipo === "analise_concluida" ? "Análise concluída" : "Falha na análise"
  const corpo =
    tipo === "analise_concluida"
      ? `${escopo} — pronto para revisão.`
      : `${escopo} — ${detalhe ?? "verifique e reprocesse o pacote."}`

  await supabase.from("notificacoes").insert({
    fechamento_id: context.id,
    tipo,
    titulo,
    corpo,
  })
}
