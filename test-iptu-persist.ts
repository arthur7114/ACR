// test-iptu-persist.ts
import { createSupabaseAdmin } from "./lib/server/supabase"
import { importarCertidaoIptu } from "./lib/server/persist-iptu"

async function run() {
  const supabase = createSupabaseAdmin()

  const { data: imobiliaria } = await supabase
    .from("imobiliarias")
    .select("id")
    .eq("nome", "Alive Imoveis")
    .single()
  const { data: empreendimento } = await supabase
    .from("empreendimentos")
    .select("id")
    .eq("nome", "Grand Messejana II")
    .single()

  if (!imobiliaria || !empreendimento) {
    throw new Error("Fixtures 'Alive Imoveis' / 'Grand Messejana II' nao encontradas — ajuste os nomes antes de rodar.")
  }

  const unidadeTeste = `TESTE-IPTU-${Date.now()}`
  const { data: imovel, error: imovelError } = await supabase
    .from("imoveis")
    .insert({
      imobiliaria_id: imobiliaria.id,
      empreendimento_id: empreendimento.id,
      codigo_imobiliaria: unidadeTeste,
      unidade: unidadeTeste,
      status: "vago",
    })
    .select("id")
    .single()
  if (imovelError) throw imovelError

  try {
    const resultado = await importarCertidaoIptu({
      imobiliariaId: imobiliaria.id,
      empreendimentoId: empreendimento.id,
      fileName: "teste-certidao.pdf",
      fileType: "application/pdf",
      fileBuffer: Buffer.from("PDF FAKE PARA TESTE"),
      extracao: {
        competencia_relatorio: "03/2026",
        apartamentos: [{ unidade: unidadeTeste, parcelas_pagas: 3, ano_carne: 2026 }],
      },
    })

    console.log("Resultado da importacao:", resultado)
    if (resultado.parcelasNovas !== 3) throw new Error(`Esperava 3 parcelas novas, veio ${resultado.parcelasNovas}`)
    if (resultado.apartamentosNaoVinculados.length !== 0) throw new Error("Nao deveria ter apartamento nao vinculado")

    const { data: carne } = await supabase.from("iptu_carnes").select("id").eq("imovel_id", imovel.id).single()
    const { data: parcelas } = await supabase
      .from("iptu_parcelas")
      .select("numero, pago, responsavel, status_imovel_no_registro")
      .eq("carne_id", carne!.id)
      .order("numero")

    console.log("Parcelas criadas:", parcelas)
    if (parcelas?.length !== 3) throw new Error(`Esperava 3 parcelas, vieram ${parcelas?.length}`)
    if (parcelas.some((p) => p.responsavel !== "proprietario")) {
      throw new Error("Imovel vago deveria gerar responsavel=proprietario em todas as parcelas")
    }

    console.log("OK: smoke test de importacao de IPTU passou.")
  } finally {
    await supabase.from("imoveis").delete().eq("id", imovel.id)
  }
}

run().catch((error) => {
  console.error("FALHOU:", error)
  process.exit(1)
})
