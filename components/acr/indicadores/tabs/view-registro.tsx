"use client"

import { useMemo, useState } from "react"
import { Info } from "lucide-react"
import { formatBRL } from "@/lib/format"
import type { IndicadoresData } from "@/lib/indicadores-types"
import { Card, CardNote, ChartCardHeader } from "../primitives/chart-card"
import { SectionHeader } from "../primitives/section-header"

export function ViewRegistro({ data }: { data: IndicadoresData }) {
  const [q, setQ] = useState("")
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return data.registro
    return data.registro.filter(
      (r) =>
        r.apto.toLowerCase().includes(t) ||
        r.inquilino.toLowerCase().includes(t) ||
        r.empreendimento.toLowerCase().includes(t),
    )
  }, [q, data.registro])

  return (
    <>
      <SectionHeader>Registro de pagamentos por apto e inquilino</SectionHeader>
      <Card>
        <ChartCardHeader
          title="Pagamentos extraídos"
          desc="Todas as competências processadas"
          source="prestação de contas (receitas por imóvel)"
          right={
            <input
              className="min-w-[280px] rounded-[9px] border border-acr-line-2 px-3 py-2 text-[12.5px] font-medium text-acr-muted-2 outline-none focus:border-acr-green"
              placeholder="Buscar apto, inquilino ou empreendimento…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-acr-muted">
                <Th>Competência</Th>
                <Th>Apto</Th>
                <Th>Inquilino</Th>
                <Th>Empreendimento</Th>
                <Th right>Aluguel</Th>
                <Th right>Desconto</Th>
                <Th right>Total pago</Th>
                <Th right>Repasse</Th>
                <Th>Vencimento</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.competencia}-${r.apto}-${i}`} className="hover:bg-acr-green-tint">
                  <Td>{r.competenciaLabel}</Td>
                  <Td className="font-semibold">{r.apto}</Td>
                  <Td>{r.inquilino}</Td>
                  <Td className="text-acr-muted">{r.empreendimento}</Td>
                  <Td right>{r.aluguel !== null ? formatBRL(r.aluguel) : "—"}</Td>
                  <Td right>{r.desconto ? formatBRL(r.desconto) : "—"}</Td>
                  <Td right className="font-semibold">
                    {formatBRL(r.total)}
                  </Td>
                  <Td right>{r.repasse !== null ? formatBRL(r.repasse) : "—"}</Td>
                  <Td>{r.vencimento ?? "—"}</Td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-3 text-center text-acr-muted">
                    Nenhum pagamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <CardNote icon={<Info size={15} className="shrink-0 text-acr-green" />}>
          {filtered.length} lançamento(s) · um por imóvel/competência extraído da prestação.
        </CardNote>
      </Card>
    </>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`border-b border-acr-line px-2.5 py-2 font-semibold ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  )
}

function Td({ children, right, className = "" }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <td
      className={`border-b border-acr-line px-2.5 py-2.5 ${right ? "text-right tabular-nums" : ""} ${className}`}
    >
      {children}
    </td>
  )
}
