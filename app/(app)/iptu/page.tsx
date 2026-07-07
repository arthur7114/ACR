"use client"

import { IptuView } from "@/components/acr/views/iptu-view"
import { useCadastros } from "@/lib/contexts/cadastros-context"
import { IptuProvider, useIptu } from "@/lib/contexts/iptu-context"

function IptuPageContent() {
  const { cadastros } = useCadastros()
  const {
    parcelas,
    resumo,
    pagination,
    filtros,
    loading,
    error,
    setFiltros,
    setPage,
    gerar,
    editarParcela,
    baixar,
    ajustarNumeroParcelas,
  } = useIptu()

  return (
    <IptuView
      imobiliarias={cadastros.imobiliarias}
      empreendimentos={cadastros.empreendimentos}
      imoveis={cadastros.imoveis}
      parcelas={parcelas}
      resumo={resumo}
      pagination={pagination}
      filtros={filtros}
      loading={loading}
      error={error}
      onFiltrosChange={setFiltros}
      onPageChange={setPage}
      onGerar={gerar}
      onEditar={editarParcela}
      onBaixar={baixar}
      onAjustarParcelas={ajustarNumeroParcelas}
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
