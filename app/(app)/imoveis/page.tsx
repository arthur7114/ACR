"use client"

import { ImoveisView } from "@/components/acr/views/imoveis-view"
import { useCadastros } from "@/lib/contexts/cadastros-context"

const URLS = {
  imoveis: "/api/cadastros/imoveis",
  imobiliarias: "/api/cadastros/imobiliarias",
  empreendimentos: "/api/cadastros/empreendimentos",
  regras: "/api/cadastros/regras-comerciais",
} as const

export default function ImoveisPage() {
  const {
    cadastros,
    loading,
    error,
    importResult,
    saveCadastro,
    deactivateCadastro,
    reactivateCadastro,
    deleteCadastro,
    includeInactive,
    setIncludeInactive,
    importImoveis,
    reload,
  } = useCadastros()

  return (
    <ImoveisView
      imobiliarias={cadastros.imobiliarias}
      empreendimentos={cadastros.empreendimentos}
      imoveis={cadastros.imoveis}
      regrasComerciais={cadastros.regrasComerciais}
      loading={loading}
      error={error}
      importResult={importResult}
      includeInactive={includeInactive}
      onToggleInactive={setIncludeInactive}
      onSaveImovel={(input) => saveCadastro(URLS.imoveis, input)}
      onDeactivateImovel={(id) => deactivateCadastro(URLS.imoveis, id)}
      onReactivateImovel={(id) => reactivateCadastro(URLS.imoveis, id)}
      onDeleteImovel={(id) => deleteCadastro(URLS.imoveis, id)}
      onSaveImobiliaria={(input) => saveCadastro(URLS.imobiliarias, input)}
      onDeactivateImobiliaria={(id) => deactivateCadastro(URLS.imobiliarias, id)}
      onReactivateImobiliaria={(id) => reactivateCadastro(URLS.imobiliarias, id)}
      onDeleteImobiliaria={(id) => deleteCadastro(URLS.imobiliarias, id)}
      onSaveEmpreendimento={(input) => saveCadastro(URLS.empreendimentos, input)}
      onDeactivateEmpreendimento={(id) => deactivateCadastro(URLS.empreendimentos, id)}
      onReactivateEmpreendimento={(id) => reactivateCadastro(URLS.empreendimentos, id)}
      onDeleteEmpreendimento={(id) => deleteCadastro(URLS.empreendimentos, id)}
      onSaveRegraComercial={(input) => saveCadastro(URLS.regras, input)}
      onDeactivateRegraComercial={(id) => deactivateCadastro(URLS.regras, id)}
      onReactivateRegraComercial={(id) => reactivateCadastro(URLS.regras, id)}
      onDeleteRegraComercial={(id) => deleteCadastro(URLS.regras, id)}
      onImportImoveis={async (file) => {
        await importImoveis(file)
      }}
      onSyncImoveis={async () => {
        const response = await fetch("/api/cadastros/imoveis/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error ?? "Falha ao sincronizar imóveis.")
        // Sincroniza tambem os acordos parcelados (best-effort; nao falha o fluxo).
        await fetch("/api/acordos/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }).catch(() => {})
        await reload()
        return { criados: json.criados, atualizados: json.atualizados, totalUnidades: json.totalUnidades }
      }}
    />
  )
}
