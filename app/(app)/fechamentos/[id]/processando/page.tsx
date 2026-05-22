import { ProcessandoView } from "@/components/acr/views/processando-view"

export default async function ProcessandoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProcessandoView fechamentoId={id} />
}
