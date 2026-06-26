import type { IndicadoresData } from "@/lib/indicadores-types"
import { SectionHeader } from "./section-header"

/** Bloco "aguardando dados": indicadores que preenchem com o tempo. */
export function Pendencias({ data }: { data: IndicadoresData }) {
  if (data.pendencias.length === 0) return null
  return (
    <>
      <SectionHeader>Aguardando dados</SectionHeader>
      <div className="rounded-2xl border border-dashed border-acr-line-2 bg-[repeating-linear-gradient(45deg,#fff,#fff_10px,#fcfdfc_10px,#fcfdfc_20px)] p-5">
        <h3 className="text-sm font-semibold text-acr-ink">Indicadores que preenchem com o tempo</h3>
        <p className="mb-3 mt-1 text-xs text-acr-muted">
          Dependem de dados ainda não extraídos. Aparecem automaticamente conforme novos fechamentos.
        </p>
        <ul className="list-disc pl-[18px] text-xs leading-[1.7] text-acr-muted-2">
          {data.pendencias.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </div>
    </>
  )
}
