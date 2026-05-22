import { UploadView } from "@/components/acr/views/upload-view"

export default async function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <UploadView fechamentoId={id} />
}
