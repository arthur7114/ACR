"use client"

import { useMemo, useRef, useState } from "react"
import { AlertTriangle, FileUp, Loader2, Receipt } from "lucide-react"
import type { Empreendimento, Imobiliaria } from "@/lib/cadastros-types"
import type { ImportarCertidaoResultado, IptuCarneComParcelas, IptuImportacao, IptuResponsavel } from "@/lib/contexts/iptu-context"

interface IptuViewProps {
  imobiliarias: Imobiliaria[]
  empreendimentos: Empreendimento[]
  carnes: IptuCarneComParcelas[]
  importacoes: IptuImportacao[]
  loading: boolean
  error: string | null
  empreendimentoId: string | null
  ultimoResultadoImportacao: ImportarCertidaoResultado | null
  onSelectEmpreendimento: (id: string | null) => void
  onImportar: (input: { file: File; imobiliariaId: string; empreendimentoId: string }) => Promise<void>
  onAtualizarResponsavel: (parcelaId: string, responsavel: IptuResponsavel) => Promise<void>
  onAtualizarNumeroParcelas: (carneId: string, numeroParcelas: number) => Promise<void>
}

export function IptuView({
  imobiliarias,
  empreendimentos,
  carnes,
  importacoes,
  loading,
  error,
  empreendimentoId,
  ultimoResultadoImportacao,
  onSelectEmpreendimento,
  onImportar,
  onAtualizarResponsavel,
  onAtualizarNumeroParcelas,
}: IptuViewProps) {
  const [imobiliariaId, setImobiliariaId] = useState<string>("")
  const [importando, setImportando] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const totalPorApartamento = useMemo(
    () =>
      carnes.map((carne) => ({
        carne,
        pagas: carne.parcelas.filter((p) => p.pago).length,
        doProprietario: carne.parcelas.filter((p) => p.responsavel === "proprietario").length,
        doInquilino: carne.parcelas.filter((p) => p.responsavel === "inquilino").length,
      })),
    [carnes],
  )

  async function handleFileSelected(file: File) {
    if (!imobiliariaId || !empreendimentoId) {
      setImportError("Selecione imobiliaria e empreendimento antes de importar.")
      return
    }
    setImportando(true)
    setImportError(null)
    try {
      await onImportar({ file, imobiliariaId, empreendimentoId })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Falha ao importar certidao.")
    } finally {
      setImportando(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center gap-3">
        <Receipt size={24} className="text-[#2D8C3A]" />
        <h1 className="text-2xl font-bold text-[#1A2B1C]">Controle de IPTU</h1>
      </header>

      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={imobiliariaId}
          onChange={(event) => setImobiliariaId(event.target.value)}
        >
          <option value="">Imobiliaria...</option>
          {imobiliarias.map((imob) => (
            <option key={imob.id} value={imob.id}>
              {imob.nome}
            </option>
          ))}
        </select>

        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={empreendimentoId ?? ""}
          onChange={(event) => onSelectEmpreendimento(event.target.value || null)}
        >
          <option value="">Empreendimento...</option>
          {empreendimentos.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.nome}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer hover:bg-black/[0.03]">
          {importando ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
          <span>Importar certidao (PDF)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={importando}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleFileSelected(file)
            }}
          />
        </label>
      </div>

      {importError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle size={16} />
          <span>{importError}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {ultimoResultadoImportacao && (
        <div className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2 space-y-1">
          <p>{ultimoResultadoImportacao.parcelasNovas} parcela(s) nova(s) registrada(s).</p>
          {ultimoResultadoImportacao.apartamentosNaoVinculados.length > 0 && (
            <p>
              Unidades nao vinculadas: {ultimoResultadoImportacao.apartamentosNaoVinculados.join(", ")}
            </p>
          )}
          {ultimoResultadoImportacao.anomalias.length > 0 && (
            <p>
              Anomalias: {ultimoResultadoImportacao.anomalias.map((a) => `${a.unidade} (${a.tipo})`).join(", ")}
            </p>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-black/50">Carregando...</p>}

      {!loading && empreendimentoId && carnes.length === 0 && (
        <p className="text-sm text-black/50">Nenhum carne de IPTU registrado para este empreendimento ainda.</p>
      )}

      <div className="space-y-3">
        {totalPorApartamento.map(({ carne, pagas, doProprietario, doInquilino }) => (
          <div key={carne.id} className="border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-black/[0.02]"
              onClick={() => setExpandido(expandido === carne.id ? null : carne.id)}
            >
              <div>
                <p className="font-medium text-sm">
                  {carne.unidade} — {carne.inquilino_nome ?? "sem inquilino"}
                </p>
                <p className="text-xs text-black/50">
                  Carne {carne.ano_referencia}: {pagas}/{carne.numero_parcelas} parcelas pagas — {doProprietario} do
                  proprietario, {doInquilino} do inquilino
                </p>
              </div>
            </button>

            {expandido === carne.id && (
              <div className="border-t px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span>Numero de parcelas do carne:</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={carne.numero_parcelas}
                    className="border rounded px-2 py-1 w-16"
                    onBlur={(event) => {
                      const valor = Number(event.target.value)
                      if (valor && valor !== carne.numero_parcelas) {
                        void onAtualizarNumeroParcelas(carne.id, valor)
                      }
                    }}
                  />
                </div>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-black/50">
                      <th className="py-1">Parcela</th>
                      <th className="py-1">Status</th>
                      <th className="py-1">Responsavel</th>
                      <th className="py-1">Registrado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carne.parcelas.map((parcela) => (
                      <tr key={parcela.id} className="border-t">
                        <td className="py-1">{parcela.numero}</td>
                        <td className="py-1">{parcela.pago ? "Paga" : "Pendente"}</td>
                        <td className="py-1">
                          {parcela.pago ? (
                            <select
                              className="border rounded px-1 py-0.5"
                              value={parcela.responsavel ?? ""}
                              onChange={(event) =>
                                void onAtualizarResponsavel(parcela.id, event.target.value as IptuResponsavel)
                              }
                            >
                              <option value="">indefinido</option>
                              <option value="inquilino">inquilino</option>
                              <option value="proprietario">proprietario</option>
                            </select>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-1">
                          {parcela.registrado_em ? new Date(parcela.registrado_em).toLocaleDateString("pt-BR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {empreendimentoId && (
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-black/[0.02]"
            onClick={() => setMostrarHistorico((v) => !v)}
          >
            <span className="text-sm font-medium">Histórico de importações ({importacoes.length})</span>
          </button>

          {mostrarHistorico && (
            <div className="border-t px-4 py-3">
              {importacoes.length === 0 ? (
                <p className="text-xs text-black/50">Nenhuma certidão importada ainda para este empreendimento.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-black/50">
                      <th className="py-1">Data</th>
                      <th className="py-1">Arquivo</th>
                      <th className="py-1">Competência do relatório</th>
                      <th className="py-1">Não vinculados</th>
                      <th className="py-1">Anomalias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importacoes.map((importacao) => (
                      <tr key={importacao.id} className="border-t">
                        <td className="py-1">{new Date(importacao.criado_em).toLocaleString("pt-BR")}</td>
                        <td className="py-1">{importacao.arquivo_nome}</td>
                        <td className="py-1">{importacao.competencia_relatorio}</td>
                        <td className="py-1">
                          {importacao.apartamentos_nao_vinculados.length === 0
                            ? "—"
                            : importacao.apartamentos_nao_vinculados.join(", ")}
                        </td>
                        <td className="py-1">
                          {importacao.anomalias.length === 0
                            ? "—"
                            : importacao.anomalias.map((a) => `${a.unidade} (${a.tipo})`).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
