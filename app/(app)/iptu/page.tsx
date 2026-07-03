"use client"

import { IptuView } from "@/components/acr/views/iptu-view"
import { useCadastros } from "@/lib/contexts/cadastros-context"
import { IptuProvider, useIptu } from "@/lib/contexts/iptu-context"

function IptuPageContent() {
  const { cadastros } = useCadastros()
  const {
    carnes,
    importacoes,
    loading,
    error,
    empreendimentoId,
    setEmpreendimentoId,
    importarCertidao,
    atualizarResponsavel,
    atualizarNumeroParcelas,
    ultimoResultadoImportacao,
  } = useIptu()

  return (
    <IptuView
      imobiliarias={cadastros.imobiliarias}
      empreendimentos={cadastros.empreendimentos}
      carnes={carnes}
      importacoes={importacoes}
      loading={loading}
      error={error}
      empreendimentoId={empreendimentoId}
      ultimoResultadoImportacao={ultimoResultadoImportacao}
      onSelectEmpreendimento={setEmpreendimentoId}
      onImportar={async (input) => {
        await importarCertidao(input)
      }}
      onAtualizarResponsavel={atualizarResponsavel}
      onAtualizarNumeroParcelas={atualizarNumeroParcelas}
    />
  )
}

export default function IptuPage() {
  return (
    <IptuProvider>
      <IptuPageContent />
    </IptuProvider>
  )
}
