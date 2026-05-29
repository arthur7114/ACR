"use client"

import { ImoveisView } from "@/components/acr/views/imoveis-view"
import { useCadastros } from "@/lib/contexts/cadastros-context"

export default function ImoveisPage() {
  const {
    cadastros,
    loading,
    error,
    importResult,
    saveCadastro,
    deactivateCadastro,
    importImoveis,
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
      onSaveImovel={(input) => saveCadastro("/api/cadastros/imoveis", input)}
      onDeactivateImovel={(id) => deactivateCadastro("/api/cadastros/imoveis", id)}
      onSaveImobiliaria={(input) => saveCadastro("/api/cadastros/imobiliarias", input)}
      onDeactivateImobiliaria={(id) => deactivateCadastro("/api/cadastros/imobiliarias", id)}
      onSaveEmpreendimento={(input) => saveCadastro("/api/cadastros/empreendimentos", input)}
      onDeactivateEmpreendimento={(id) => deactivateCadastro("/api/cadastros/empreendimentos", id)}
      onSaveRegraComercial={(input) => saveCadastro("/api/cadastros/regras-comerciais", input)}
      onDeactivateRegraComercial={(id) => deactivateCadastro("/api/cadastros/regras-comerciais", id)}
      onImportImoveis={async (file) => {
        await importImoveis(file)
      }}
    />
  )
}
