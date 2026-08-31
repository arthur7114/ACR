import assert from "node:assert/strict"
import test from "node:test"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import {
  createIndicadoresSnapshotChecksum, buildIndicadoresSnapshotRows } from "./indicadores-snapshots.ts"

test("agrupa aluguel e multa da mesma unidade sem trocar receita por aluguel", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Alive Imóveis",
      empreendimento: "Grand Messejana II",
      competencia: "2026-05",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Extrair linhas por imóvel."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "Apto 101",
          inquilino: "Maria",
          aluguel: 1_000,
          desconto: 50,
          aluguel_com_desconto: 950,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 1_000,
          comissao: 70,
          repasse: 930,
          vencimento: "05/2026",
          observacao: "Aluguel da competência.",
          confianca: 0.98,
        },
        {
          apto: "Apto 101",
          inquilino: "Maria",
          aluguel: null,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 75,
          comissao: null,
          repasse: 75,
          vencimento: null,
          observacao: "Multa e encargos por atraso.",
          confianca: 0.94,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [],
      resumo_financeiro: {
        total_linhas_receitas: 1_075,
        total_linhas_comissoes: 70,
        total_linhas_repasse: 1_005,
        comissao_administracao: 70,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 70,
        recebidos_em_nome_locador: 1_075,
        total_a_repassar: 1_005,
        confianca: 0.98,
      },
      totais: {
        total_receitas: 1_075,
        total_comissoes: 70,
        total_repassar: 1_005,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.98,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const result = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "imovel-101",
        unit: "Apto 101",
        expectedRent: 1_000,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Grand Messejana II",
      },
    ],
    fechamentoId: "fechamento-maio",
    competencia: "2026-05",
    analysis,
  })

  assert.equal(result.rows[0].quantidade_linhas, 2)
  assert.equal(result.rows[0].aluguel_recebido, 950)
  assert.equal(result.rows[0].receita_total, 1_075)
})

test("materializa imóvel esperado sem linha como desconhecido e sem_linha", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Alive Imóveis",
      empreendimento: "Grand Messejana II",
      competencia: "2026-05",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Extrair linhas por imóvel."],
        alertas: [],
      },
      receitas_por_imovel: [],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [],
      resumo_financeiro: {
        total_linhas_receitas: 0,
        total_linhas_comissoes: 0,
        total_linhas_repasse: 0,
        comissao_administracao: 0,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 0,
        recebidos_em_nome_locador: 0,
        total_a_repassar: 0,
        confianca: 0.96,
      },
      totais: {
        total_receitas: 0,
        total_comissoes: 0,
        total_repassar: 0,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.96,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const result = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "imovel-sem-linha",
        unit: "Apto 102",
        expectedRent: 1_200,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Grand Messejana II",
      },
    ],
    fechamentoId: "fechamento-maio",
    competencia: "2026-05",
    analysis,
  })

  assert.equal(result.rows[0].status_ocupacao, "desconhecido")
  assert.equal(result.rows[0].status_origem, "sem_linha")
  assert.equal(result.rows[0].qualidade, "sem_linha")
  assert.equal(result.rows[0].quantidade_linhas, 0)
  assert.equal(result.rows[0].aluguel_recebido, null)
  assert.equal(result.rows[0].receita_total, null)
  assert.equal(result.rows[0].desconto, null)
  assert.equal(result.rows[0].comissao_administracao, null)
  assert.equal(result.rows[0].repasse_apurado, null)
})

test("imóvel de receita variável sem linha é ocupado pelo cadastro, não desconhecido", () => {
  // Caso Airbnb do Grand Maracanaú: unidade de temporada não listada na
  // prestação do mês. O cadastro (receita variável) resolve a ocupação.
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Alive Imóveis",
      empreendimento: "GRAND MARACANAÚ",
      competencia: "2026-05",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Extrair linhas por imóvel."],
        alertas: [],
      },
      receitas_por_imovel: [],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [],
      resumo_financeiro: {
        total_linhas_receitas: 0,
        total_linhas_comissoes: 0,
        total_linhas_repasse: 0,
        comissao_administracao: 0,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 0,
        recebidos_em_nome_locador: 0,
        total_a_repassar: 0,
        confianca: 0.96,
      },
      totais: { total_receitas: 0, total_comissoes: 0, total_repassar: 0 },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.96,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const result = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "imovel-airbnb",
        unit: "103",
        expectedRent: null,
        revenueModel: "variavel",
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "GRAND MARACANAÚ",
      },
    ],
    fechamentoId: "fechamento-maio",
    competencia: "2026-05",
    analysis,
  })

  assert.equal(result.rows[0].status_ocupacao, "ocupado")
  assert.equal(result.rows[0].status_origem, "cadastro_receita_variavel")
  assert.equal(result.rows[0].quantidade_linhas, 0)
  // Sem inventar dinheiro: receita variável sem linha não recebeu nada.
  assert.equal(result.rows[0].aluguel_recebido, null)
  assert.equal(result.rows[0].receita_total, null)
  assert.equal(result.rows[0].aluguel_esperado, null)
})

// Antes este teste fixava o contrário: linha sem inquilino e sem aluguel ficava
// `desconhecido`, para não inferir vacância de ausência de dado. A decisão foi
// revista (a imobiliária lista a unidade na prestação sem inquilino e sem
// aluguel justamente quando ela está vazia), então os três caminhos convergem
// para `vago` e o que os separa passa a ser a PROCEDÊNCIA. Mês sem linha alguma
// continua `desconhecido` — coberto pelo teste do imóvel esperado sem linha.
test("vacancia explicita e linha sem inquilino convergem para vago, com procedencias distintas", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Alive Imóveis",
      empreendimento: "Grand Messejana II",
      competencia: "2026-05",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Extrair linhas por imóvel."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "101",
          inquilino: "",
          aluguel: 0,
          desconto: 0,
          aluguel_com_desconto: 0,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 0,
          comissao: 0,
          repasse: 0,
          vencimento: "05/2026",
          observacao: null,
          confianca: 0.9,
        },
        {
          apto: "102",
          inquilino: "VAGO",
          aluguel: 0,
          desconto: 0,
          aluguel_com_desconto: 0,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 0,
          comissao: 0,
          repasse: 0,
          vencimento: "05/2026",
          observacao: null,
          confianca: 0.95,
        },
        {
          apto: "103",
          inquilino: "",
          aluguel: 0,
          desconto: 0,
          aluguel_com_desconto: 0,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 0,
          comissao: 0,
          repasse: 0,
          vencimento: "05/2026",
          observacao: "Unidade DESOCUPADA no mês.",
          confianca: 0.95,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [],
      resumo_financeiro: {
        total_linhas_receitas: 0,
        total_linhas_comissoes: 0,
        total_linhas_repasse: 0,
        comissao_administracao: 0,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 0,
        recebidos_em_nome_locador: 0,
        total_a_repassar: 0,
        confianca: 0.95,
      },
      totais: {
        total_receitas: 0,
        total_comissoes: 0,
        total_repassar: 0,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.95,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const result = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "imovel-101",
        unit: "101",
        expectedRent: 900,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Grand Messejana II",
      },
      {
        id: "imovel-102",
        unit: "102",
        expectedRent: 1_000,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Grand Messejana II",
      },
      {
        id: "imovel-103",
        unit: "103",
        expectedRent: 1_100,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Grand Messejana II",
      },
    ],
    fechamentoId: "fechamento-maio",
    competencia: "2026-05",
    analysis,
  })

  const row101 = result.rows.find((row) => row.imovel_id === "imovel-101")
  const row102 = result.rows.find((row) => row.imovel_id === "imovel-102")
  const row103 = result.rows.find((row) => row.imovel_id === "imovel-103")

  // 101: sem inquilino, sem aluguel, sem texto — vacância inferida da linha.
  assert.equal(row101?.status_ocupacao, "vago")
  assert.equal(row101?.status_origem, "prestacao_sem_inquilino")
  assert.equal(row101?.status_mensal_explicito, null)

  // 102 e 103: vacância dita por escrito, no inquilino ou na observação.
  assert.equal(row102?.status_ocupacao, "vago")
  assert.equal(row102?.status_origem, "prestacao_vacancia")
  assert.equal(row102?.status_mensal_explicito, "vago")
  assert.equal(row103?.status_ocupacao, "vago")
  assert.equal(row103?.status_origem, "prestacao_vacancia")
})

test("marca como parcial quando a linha existe sem aluguel esperado", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Alive Imóveis",
      empreendimento: "Grand Messejana II",
      competencia: "2026-05",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Extrair linhas por imóvel."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "104",
          inquilino: "Ana",
          aluguel: 850,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 850,
          comissao: 59.5,
          repasse: 790.5,
          vencimento: "05/2026",
          observacao: null,
          confianca: 0.97,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [],
      resumo_financeiro: {
        total_linhas_receitas: 850,
        total_linhas_comissoes: 59.5,
        total_linhas_repasse: 790.5,
        comissao_administracao: 59.5,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 59.5,
        recebidos_em_nome_locador: 850,
        total_a_repassar: 790.5,
        confianca: 0.97,
      },
      totais: {
        total_receitas: 850,
        total_comissoes: 59.5,
        total_repassar: 790.5,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.97,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const result = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "imovel-104",
        unit: "104",
        expectedRent: null,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Grand Messejana II",
      },
    ],
    fechamentoId: "fechamento-maio",
    competencia: "2026-05",
    analysis,
  })

  assert.equal(result.rows[0].qualidade, "parcial")
  assert.equal(result.rows[0].aluguel_esperado, null)
  assert.equal(result.rows[0].aluguel_esperado_origem, null)
  assert.equal(result.rows[0].aluguel_recebido, 850)
})

test("mantem ordenacao e checksums determinísticos em execucoes repetidas", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Alive Imóveis",
      empreendimento: "Grand Messejana II",
      competencia: "2026-05",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Extrair linhas por imóvel."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "202",
          inquilino: "Zelia",
          aluguel: 1_200,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 1_200,
          comissao: 84,
          repasse: 1_116,
          vencimento: "05/2026",
          observacao: null,
          confianca: 0.97,
        },
        {
          apto: "201",
          inquilino: "Alice",
          aluguel: 1_000,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 1_000,
          comissao: 70,
          repasse: 930,
          vencimento: "05/2026",
          observacao: null,
          confianca: 0.98,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [],
      resumo_financeiro: {
        total_linhas_receitas: 2_200,
        total_linhas_comissoes: 154,
        total_linhas_repasse: 2_046,
        comissao_administracao: 154,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 154,
        recebidos_em_nome_locador: 2_200,
        total_a_repassar: 2_046,
        confianca: 0.98,
      },
      totais: {
        total_receitas: 2_200,
        total_comissoes: 154,
        total_repassar: 2_046,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.98,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">
  const input = {
    properties: [
      {
        id: "z-imovel",
        unit: "202",
        expectedRent: 1_200,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Grand Messejana II",
      },
      {
        id: "a-imovel",
        unit: "201",
        expectedRent: 1_000,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Grand Messejana II",
      },
    ],
    fechamentoId: "fechamento-maio",
    competencia: "2026-05",
    analysis,
  }

  const first = buildIndicadoresSnapshotRows(input)
  const second = buildIndicadoresSnapshotRows(input)

  assert.deepEqual(first, second)
  assert.deepEqual(first.rows.map((row) => row.imovel_id), ["a-imovel", "z-imovel"])
  assert.deepEqual(
    first.rows.map((row) => row.checksum),
    second.rows.map((row) => row.checksum),
  )
})

test("reporta linha cuja unidade nao existe no cadastro", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Alive Imóveis",
      empreendimento: "Grand Messejana II",
      competencia: "2026-05",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Extrair linhas por imóvel."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "999",
          inquilino: "Unidade não cadastrada",
          aluguel: 500,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 500,
          comissao: 35,
          repasse: 465,
          vencimento: "05/2026",
          observacao: null,
          confianca: 0.9,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [],
      resumo_financeiro: {
        total_linhas_receitas: 500,
        total_linhas_comissoes: 35,
        total_linhas_repasse: 465,
        comissao_administracao: 35,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 35,
        recebidos_em_nome_locador: 500,
        total_a_repassar: 465,
        confianca: 0.9,
      },
      totais: {
        total_receitas: 500,
        total_comissoes: 35,
        total_repassar: 465,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.9,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const result = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "imovel-101",
        unit: "101",
        expectedRent: 1_000,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Grand Messejana II",
      },
    ],
    fechamentoId: "fechamento-maio",
    competencia: "2026-05",
    analysis,
  })

  assert.equal(result.linkedLineCount, 0)
  assert.equal(result.unlinkedLineCount, 1)
  assert.deepEqual(result.unlinkedLines, [
    {
      lineIndex: 0,
      propertyKey: "alive imoveis::grand messejana ii::999",
      unit: "999",
      tenantName: "Unidade não cadastrada",
    },
  ])

  const malformedSinglePropertyAnalysis = structuredClone(analysis)
  malformedSinglePropertyAnalysis.prestacao!.receitas_por_imovel[0].apto =
    "Unidade não cadastrada"
  const unambiguous = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "imovel-unico",
        unit: "TERRENO",
        expectedRent: 1_000,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Terreno Castelão",
      },
    ],
    fechamentoId: "fechamento-terreno",
    competencia: "2026-05",
    analysis: malformedSinglePropertyAnalysis,
  })

  assert.equal(unambiguous.linkedLineCount, 1)
  assert.equal(unambiguous.unlinkedLineCount, 0)
  assert.equal(unambiguous.rows[0].quantidade_linhas, 1)
})

test("preserva origem backfill na linha materializada", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Alive Imóveis",
      empreendimento: "Grand Messejana II",
      competencia: "2026-03",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Extrair linhas por imóvel."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "105",
          inquilino: "Carlos",
          aluguel: 900,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 900,
          comissao: 63,
          repasse: 837,
          vencimento: "03/2026",
          observacao: null,
          confianca: 0.93,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [],
      resumo_financeiro: {
        total_linhas_receitas: 900,
        total_linhas_comissoes: 63,
        total_linhas_repasse: 837,
        comissao_administracao: 63,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 63,
        recebidos_em_nome_locador: 900,
        total_a_repassar: 837,
        confianca: 0.93,
      },
      totais: {
        total_receitas: 900,
        total_comissoes: 63,
        total_repassar: 837,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.93,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const result = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "imovel-105",
        unit: "105",
        expectedRent: 900,
        realEstateAgencyName: "Alive Imoveis",
        developmentName: "Grand Messejana II",
      },
    ],
    fechamentoId: "fechamento-marco",
    competencia: "2026-03",
    analysis,
    origem: "backfill",
  })

  assert.equal(result.rows[0].origem, "backfill")
})

test("separa atraso recuperado e preserva inadimplência explícita da competência", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Imobiliária GM",
      empreendimento: "Grand Messejana II",
      competencia: "2026-03",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas", "inadimplencias"],
        estrategia: ["Separar competência original do recebimento."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "3",
          inquilino: "Cliente 3",
          aluguel: 707.37,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 707.37,
          comissao: null,
          repasse: 707.37,
          competencia_original: "02/2026",
          competencia_recebimento: "2026-03",
          dia_vencimento: 10,
          vencimento: "10/02/2026",
          observacao: "Recebimento do aluguel de fevereiro.",
          confianca: 0.99,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [
        {
          apto: "3",
          inquilino: "Cliente 3",
          valor: 705.89,
          condicao: "Em aberto",
          observacao: "Aluguel de março não pago.",
          confianca: 0.99,
        },
      ],
      resumo_financeiro: {
        total_linhas_receitas: 707.37,
        total_linhas_comissoes: 0,
        total_linhas_repasse: 707.37,
        comissao_administracao: 0,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 0,
        recebidos_em_nome_locador: 707.37,
        total_a_repassar: 707.37,
        confianca: 0.99,
      },
      totais: {
        total_receitas: 707.37,
        total_comissoes: 0,
        total_repassar: 707.37,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.99,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const result = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "gmii-3",
        unit: "3",
        expectedRent: 705.89,
        revenueModel: "fixo",
        expectedRentSource: "vigencia",
        realEstateAgencyName: "Imobiliária GM",
        developmentName: "Grand Messejana II",
      },
    ],
    fechamentoId: "gmii-marco",
    competencia: "2026-03",
    analysis,
  })

  const row = result.rows[0]
  assert.equal(row.status_ocupacao, "inadimplente")
  assert.equal(row.status_mensal_explicito, "inadimplente")
  assert.equal(row.aluguel_competencia, null)
  assert.equal(row.atrasos_recuperados, 707.37)
  assert.equal(row.aluguel_recebido, 707.37)
  assert.equal(row.competencia_original, "2026-02-01")
  assert.equal(row.competencia_recebimento, "2026-03-01")
  assert.equal(row.dia_vencimento, 10)
})

test("receita variável mantém aluguel contratado como não aplicável, nunca zero", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Alive Imóveis",
      empreendimento: "Airbnb",
      competencia: "2026-06",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Extrair receita variável."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "A1",
          inquilino: "Airbnb",
          aluguel: 1_200,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 1_200,
          comissao: 84,
          repasse: 1_116,
          vencimento: null,
          observacao: "Hospedagens Airbnb.",
          confianca: 0.99,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [],
      resumo_financeiro: {
        total_linhas_receitas: 1_200,
        total_linhas_comissoes: 84,
        total_linhas_repasse: 1_116,
        comissao_administracao: 84,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 84,
        recebidos_em_nome_locador: 1_200,
        total_a_repassar: 1_116,
        confianca: 0.99,
      },
      totais: {
        total_receitas: 1_200,
        total_comissoes: 84,
        total_repassar: 1_116,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.99,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const row = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "airbnb-a1",
        unit: "A1",
        expectedRent: 0,
        revenueModel: "variavel",
        expectedRentSource: "vigencia",
        realEstateAgencyName: "Alive Imóveis",
        developmentName: "Airbnb",
      },
    ],
    fechamentoId: "airbnb-junho",
    competencia: "2026-06",
    analysis,
  }).rows[0]

  assert.equal(row.modelo_receita, "variavel")
  assert.equal(row.aluguel_esperado, null)
  assert.equal(row.aluguel_esperado_origem, null)
  assert.equal(row.status_ocupacao, "ocupado")
  assert.equal(row.qualidade, "completo")
})

test("movimento de passagem não vira outros recebimentos no snapshot", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Plural Imobiliária",
      empreendimento: "Galpão José Walter",
      competencia: "2026-06",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas"],
        estrategia: ["Separar IPTU de passagem."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "GA0002/2",
          inquilino: "",
          aluguel: 3_200,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: 445.95,
          seguro_incendio: null,
          total: 3_200,
          outros_recebimentos: null,
          entradas_passagem: 445.95,
          saidas_passagem: null,
          comissao: 256,
          repasse: 3_389.95,
          vencimento: null,
          observacao: "Devolução de parcela de IPTU.",
          confianca: 1,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [],
      resumo_financeiro: {
        total_linhas_receitas: 3_200,
        total_linhas_comissoes: 256,
        total_linhas_repasse: 3_389.95,
        comissao_administracao: 256,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 256,
        recebidos_em_nome_locador: 3_200,
        total_a_repassar: 3_389.95,
        confianca: 1,
      },
      totais: {
        total_receitas: 3_200,
        total_comissoes: 256,
        total_repassar: 3_389.95,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 1,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const row = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "plural-ga0002",
        unit: "GA0002",
        expectedRent: 3_200,
        revenueModel: "fixo",
        expectedRentSource: "vigencia",
        realEstateAgencyName: "Plural Imobiliária",
        developmentName: "Galpão José Walter",
      },
    ],
    fechamentoId: "plural-junho",
    competencia: "2026-06",
    analysis,
  }).rows[0]

  assert.equal(row.qualidade, "completo")
  assert.equal(row.aluguel_competencia, 3_200)
  assert.equal(row.outros_recebimentos, 0)
  assert.equal(row.entradas_passagem, 445.95)
  assert.equal(row.saidas_passagem, null)
})

test("vacancia explicita da competencia atual nao vira inadimplente por divida acumulada antiga", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Imobiliária GM",
      empreendimento: "Grand Messejana I",
      competencia: "2026-06",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas", "inadimplencias"],
        estrategia: ["Separar vacância corrente de dívida acumulada."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "15",
          inquilino: "",
          aluguel: 0,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 0,
          comissao: null,
          repasse: 0,
          vencimento: null,
          observacao: "DESOCUPADO",
          confianca: 0.95,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [
        {
          apto: "15",
          inquilino: "Ex-inquilino",
          valor: 708.22,
          condicao: "Em aberto",
          observacao: "Débito de vigência anterior, inquilino já não ocupa mais a unidade.",
          confianca: 0.95,
        },
      ],
      resumo_financeiro: {
        total_linhas_receitas: 0,
        total_linhas_comissoes: 0,
        total_linhas_repasse: 0,
        comissao_administracao: 0,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 0,
        recebidos_em_nome_locador: 0,
        total_a_repassar: 0,
        confianca: 0.95,
      },
      totais: {
        total_receitas: 0,
        total_comissoes: 0,
        total_repassar: 0,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.95,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const row = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "gmi-15",
        unit: "15",
        expectedRent: 677.72,
        revenueModel: "fixo",
        expectedRentSource: "vigencia",
        realEstateAgencyName: "Imobiliária GM",
        developmentName: "Grand Messejana I",
      },
    ],
    fechamentoId: "gmi-junho",
    competencia: "2026-06",
    analysis,
  }).rows[0]

  assert.equal(row.status_ocupacao, "vago")
  assert.equal(row.status_mensal_explicito, "vago")
})

test("inadimplencia acumulada continua valendo quando a unidade ainda esta ocupada", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Imobiliária GM",
      empreendimento: "Grand Messejana I",
      competencia: "2026-06",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas", "inadimplencias"],
        estrategia: ["Manter inadimplência quando a unidade segue ocupada."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "16",
          inquilino: "Renata",
          aluguel: 0,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 0,
          comissao: null,
          repasse: 0,
          vencimento: null,
          observacao: "Aguardando regularização.",
          confianca: 0.95,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [
        {
          apto: "16",
          inquilino: "Renata",
          valor: 700,
          condicao: "Em aberto",
          competencia_original: "06/2026",
          observacao: "Vigência junho 2026.",
          confianca: 0.95,
        },
      ],
      resumo_financeiro: {
        total_linhas_receitas: 0,
        total_linhas_comissoes: 0,
        total_linhas_repasse: 0,
        comissao_administracao: 0,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 0,
        recebidos_em_nome_locador: 0,
        total_a_repassar: 0,
        confianca: 0.95,
      },
      totais: {
        total_receitas: 0,
        total_comissoes: 0,
        total_repassar: 0,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.95,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const row = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "gmi-16",
        unit: "16",
        expectedRent: 720,
        revenueModel: "fixo",
        expectedRentSource: "vigencia",
        realEstateAgencyName: "Imobiliária GM",
        developmentName: "Grand Messejana I",
      },
    ],
    fechamentoId: "gmi-junho",
    competencia: "2026-06",
    analysis,
  }).rows[0]

  assert.equal(row.status_ocupacao, "inadimplente")
  assert.equal(row.status_mensal_explicito, "inadimplente")
})

test("divida acumulada da propria competencia nao cede a vacancia da mesma linha", () => {
  const analysis = {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Imobiliária GM",
      empreendimento: "Grand Messejana I",
      competencia: "2026-06",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas", "inadimplencias"],
        estrategia: ["Nao deixar vacancia da mesma linha apagar divida da competencia atual."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "8",
          inquilino: "",
          aluguel: 0,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 0,
          comissao: null,
          repasse: 0,
          vencimento: null,
          observacao: "Unidade desocupada no meio do mes.",
          confianca: 0.95,
        },
      ],
      acordos_rescisoes_recebidos: [],
      inadimplencias_acumuladas: [
        {
          apto: "8",
          inquilino: "Cliente 8",
          valor: 500,
          condicao: "Em aberto",
          competencia_original: "06/2026",
          observacao: "Debito da propria vigencia de junho.",
          confianca: 0.95,
        },
      ],
      resumo_financeiro: {
        total_linhas_receitas: 0,
        total_linhas_comissoes: 0,
        total_linhas_repasse: 0,
        comissao_administracao: 0,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 0,
        recebidos_em_nome_locador: 0,
        total_a_repassar: 0,
        confianca: 0.95,
      },
      totais: {
        total_receitas: 0,
        total_comissoes: 0,
        total_repassar: 0,
      },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.95,
    },
  } satisfies Pick<PackageAnalysis, "prestacao">

  const row = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "gmi-8",
        unit: "8",
        expectedRent: 660,
        revenueModel: "fixo",
        expectedRentSource: "vigencia",
        realEstateAgencyName: "Imobiliária GM",
        developmentName: "Grand Messejana I",
      },
    ],
    fechamentoId: "gmi-junho",
    competencia: "2026-06",
    analysis,
  }).rows[0]

  assert.equal(row.status_ocupacao, "inadimplente")
  assert.equal(row.status_mensal_explicito, "inadimplente")
})

// Fixture minima de prestacao: os testes abaixo variam so a linha de receita e
// a lista de inadimplencia, que e onde vive a atribuicao de divida.
function prestacaoFixture(input: {
  receita: Record<string, unknown>
  inadimplencias?: Array<Record<string, unknown>>
  acordos?: Array<Record<string, unknown>>
}) {
  return {
    prestacao: {
      tipo_documento: "prestacao_contas",
      imobiliaria: "Imobiliária X",
      empreendimento: "Residencial X",
      competencia: "2026-06",
      plano_extracao: {
        documento_lido_integralmente: true,
        secoes_identificadas: ["receitas", "inadimplencias"],
        estrategia: ["Atribuir divida ao devedor correto."],
        alertas: [],
      },
      receitas_por_imovel: [
        {
          apto: "10",
          inquilino: null,
          aluguel: null,
          desconto: null,
          aluguel_com_desconto: null,
          garagem: null,
          vagas_garagem: null,
          agua: null,
          iptu: null,
          seguro_incendio: null,
          total: 0,
          comissao: null,
          repasse: 0,
          vencimento: null,
          observacao: null,
          confianca: 0.95,
          ...input.receita,
        },
      ],
      acordos_rescisoes_recebidos: (input.acordos ?? []).map((item) => ({
        tipo: "atraso",
        apto: "10",
        inquilino: null,
        valor: 400,
        competencia_original: null,
        competencia_recebimento: null,
        observacao: null,
        confianca: 0.95,
        ...item,
      })),
      inadimplencias_acumuladas: (input.inadimplencias ?? []).map((item) => ({
        apto: "10",
        inquilino: null,
        valor: 500,
        condicao: "Em aberto",
        observacao: null,
        confianca: 0.95,
        ...item,
      })),
      resumo_financeiro: {
        total_linhas_receitas: 0,
        total_linhas_comissoes: 0,
        total_linhas_repasse: 0,
        comissao_administracao: 0,
        outras_comissoes_despesas: [],
        total_outras_comissoes_despesas: 0,
        total_comissao_despesas: 0,
        recebidos_em_nome_locador: 0,
        total_a_repassar: 0,
        confianca: 0.95,
      },
      totais: { total_receitas: 0, total_comissoes: 0, total_repassar: 0 },
      campos_ausentes: [],
      observacoes: [],
      confianca_geral: 0.95,
    },
  } as unknown as Pick<PackageAnalysis, "prestacao">
}

function statusFor(analysis: Pick<PackageAnalysis, "prestacao">, expectedRent: number | null) {
  return buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "x-10",
        unit: "10",
        expectedRent,
        revenueModel: expectedRent === null ? "variavel" : "fixo",
        expectedRentSource: "vigencia",
        realEstateAgencyName: "Imobiliária X",
        developmentName: "Residencial X",
      },
    ],
    fechamentoId: "x-junho",
    competencia: "2026-06",
    analysis,
  }).rows[0]
}

test("divida de ex-locatario nao marca o ocupante atual como inadimplente", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: { inquilino: "Inquilino Atual", aluguel: 690, total: 690 },
      // Devedor diferente do ocupante e sem competencia: e divida de quem saiu.
      inadimplencias: [{ inquilino: "Ex Locatario", valor: 1235, competencia_original: null }],
    }),
    690,
  )

  assert.equal(row.status_ocupacao, "ocupado")
})

test("divida de competencia anterior do mesmo inquilino nao marca o mes que foi pago integral", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: { inquilino: "Mesmo Inquilino", aluguel: 700, total: 700 },
      inadimplencias: [
        { inquilino: "Mesmo Inquilino", valor: 500, competencia_original: "05/2026" },
      ],
    }),
    700,
  )

  assert.equal(row.status_ocupacao, "ocupado")
})

test("divida de competencia anterior do mesmo inquilino continua valendo quando o mes nao foi pago", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: { inquilino: "Mesmo Inquilino", aluguel: 0, total: 0 },
      inadimplencias: [
        { inquilino: "Mesmo Inquilino", valor: 500, competencia_original: "05/2026" },
      ],
    }),
    700,
  )

  assert.equal(row.status_ocupacao, "inadimplente")
})

test("linha sem inquilino e sem aluguel vira vago, com procedencia de inferencia", () => {
  const row = statusFor(
    prestacaoFixture({ receita: { inquilino: "", aluguel: 0, total: 0 } }),
    900,
  )

  assert.equal(row.status_ocupacao, "vago")
  assert.equal(row.status_origem, "prestacao_sem_inquilino")
  // Vacancia inferida nao se passa por explicita.
  assert.equal(row.status_mensal_explicito, null)
})

test("receita variavel sem inquilino nao vira vago (Airbnb nao tem aluguel fixo)", () => {
  const row = statusFor(
    prestacaoFixture({ receita: { inquilino: "", aluguel: 0, total: 0 } }),
    null,
  )

  assert.equal(row.status_ocupacao, "ocupado")
})

test("inquilino em branco com aluguel recebido continua ocupado", () => {
  const row = statusFor(
    prestacaoFixture({ receita: { inquilino: "", aluguel: 900, total: 900 } }),
    900,
  )

  assert.equal(row.status_ocupacao, "ocupado")
})

test("atraso vindo de acordo carrega o mes de origem informado no proprio acordo", () => {
  const row = statusFor(
    prestacaoFixture({
      // Espelha o dado real: a linha declara junho (o aluguel do mes) e o acordo
      // declara maio (o atraso). Os dois campos nao podem se contaminar.
      receita: { inquilino: "Inquilino", aluguel: 700, total: 700, competencia_original: "06/2026" },
      acordos: [{ tipo: "atraso", valor: 466.93, competencia_original: "05/2026" }],
    }),
    700,
  )

  assert.equal(row.atrasos_recuperados, 466.93)
  assert.equal(row.atrasos_competencia_origem, "2026-05-01")
  assert.equal(row.competencia_original, "2026-06-01")
})

test("atrasos de meses de origem diferentes deixam a origem indefinida, nunca uma escolha arbitraria", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: { inquilino: "Inquilino", aluguel: 700, total: 700 },
      acordos: [
        { tipo: "atraso", valor: 300, competencia_original: "04/2026" },
        { tipo: "atraso", valor: 200, competencia_original: "05/2026" },
      ],
    }),
    700,
  )

  assert.equal(row.atrasos_recuperados, 500)
  assert.equal(row.atrasos_competencia_origem, null)
})

test("acordo de rescisao nao define origem de atraso", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: { inquilino: "Inquilino", aluguel: 700, total: 700 },
      acordos: [{ tipo: "rescisao", valor: 480, competencia_original: "05/2026" }],
    }),
    700,
  )

  assert.equal(row.atrasos_competencia_origem, null)
})

test("le a competencia de origem declarada na observacao quando o campo vem vazio", () => {
  // Caso real: linha de maio cujo campo estruturado veio nulo, mas o texto diz
  // de que mes o valor e. Sem isso o atraso era contado como aluguel do mes.
  const row = statusFor(
    prestacaoFixture({
      receita: {
        inquilino: "Inquilino",
        aluguel: 417.66,
        total: 417.66,
        competencia_original: null,
        observacao: "VIGÊNCIA DE ABRIL 2026. R$ 374,31 ALUGUEL + R$ 15,66 GARAGEM MOTO.",
      },
    }),
    700,
  )

  // O valor sai do aluguel da competencia e entra como atraso de abril. Sem
  // linha atribuida ao mes, o aluguel da competencia e ausencia (null), nao zero
  // confirmado -- convencao do projeto para "nao ha dado".
  assert.equal(row.aluguel_competencia, null)
  assert.equal(row.atrasos_recuperados, 417.66)
  assert.equal(row.atrasos_competencia_origem, "2026-04-01")
})

test("observacao sem vigencia nao altera a competencia da linha", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: {
        inquilino: "Inquilino",
        aluguel: 700,
        total: 700,
        competencia_original: null,
        observacao: "SEGURO QUITADO. IPTU 2026 QUITADO. GARAGEM PARA MOTO.",
      },
    }),
    700,
  )

  assert.equal(row.aluguel_competencia, 700)
  assert.equal(row.atrasos_recuperados, null)
})

test("campo estruturado tem prioridade sobre o texto da observacao", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: {
        inquilino: "Inquilino",
        aluguel: 700,
        total: 700,
        competencia_original: "06/2026",
        observacao: "VIGÊNCIA DE ABRIL 2026.",
      },
    }),
    700,
  )

  assert.equal(row.aluguel_competencia, 700)
  assert.equal(row.atrasos_recuperados, null)
})

test("observacao que cita varios meses fica ambigua e nao infere origem", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: {
        inquilino: "Inquilino",
        aluguel: 900,
        total: 900,
        competencia_original: null,
        observacao: "VIGÊNCIA DE MAIO, JUNHO, JULHO E PROPORCIONAL DE AGOSTO DE 2023.",
      },
    }),
    700,
  )

  // Sem saber a qual mes atribuir, o valor segue como aluguel da competencia:
  // inventar um dos quatro seria pior que manter o comportamento conhecido.
  assert.equal(row.aluguel_competencia, 900)
  assert.equal(row.atrasos_competencia_origem, null)
})

test("atraso recuperado usa o total recebido resolvido, nao o principal bruto", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: { inquilino: "Inquilino", aluguel: 700, total: 700 },
      acordos: [
        {
          tipo: "atraso",
          valor: 414.86,
          garagem: 52.07,
          total_recebido: 466.93,
          comissao: 32.69,
          repasse: 434.24,
          competencia_original: "05/2026",
        },
      ],
    }),
    700,
  )

  assert.equal(row.atrasos_recuperados, 466.93)
})

test("rescisao em outros recebimentos usa o total recebido resolvido", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: { inquilino: "Inquilino", aluguel: 700, total: 700 },
      acordos: [
        {
          tipo: "rescisao",
          valor: 1890,
          total_recebido: 1663.56,
          comissao: 116.45,
          repasse: 1547.11,
        },
      ],
    }),
    700,
  )

  assert.equal(row.outros_recebimentos, 1663.56)
})

test("recebimento pendente nao entra nos valores do snapshot", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: { inquilino: "Inquilino", aluguel: 700, total: 700 },
      acordos: [{ tipo: "atraso", valor: 999, confianca: 0.4, competencia_original: "05/2026" }],
    }),
    700,
  )

  assert.equal(row.atrasos_recuperados, null)
})

test("rescisao vira evento e o estado final da competencia e vago", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: { inquilino: "", aluguel: 0, total: 0 },
      acordos: [{ tipo: "rescisao", valor: 500, total_recebido: 500, comissao: 35, confianca: 0.95 }],
    }),
    900,
  )

  assert.equal(row.status_ocupacao, "vago")
  assert.deepEqual(row.eventos, ["rescisao"])
})

test("atraso recuperado registra o evento pagamento_atrasado sem mudar o estado", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: { inquilino: "Inquilino", aluguel: 700, total: 700 },
      acordos: [{ tipo: "atraso", valor: 466.93, competencia_original: "05/2026", confianca: 0.95 }],
    }),
    700,
  )

  assert.equal(row.status_ocupacao, "ocupado")
  assert.deepEqual(row.eventos, ["pagamento_atrasado"])
})

test("cobranca esperada soma aluguel e garagem contratados da vigencia", () => {
  const { rows } = buildIndicadoresSnapshotRows({
    properties: [
      {
        id: "x-204",
        unit: "10",
        expectedRent: 414.86,
        garagemContratada: 52.07,
        revenueModel: "fixo",
        expectedRentSource: "vigencia",
        realEstateAgencyName: "Imobiliária X",
        developmentName: "Residencial X",
      },
    ],
    fechamentoId: "x-julho",
    competencia: "2026-07",
    analysis: prestacaoFixture({ receita: { inquilino: "Inquilino", aluguel: 414.86, total: 466.93 } }),
  })

  assert.equal(rows[0]?.cobranca_esperada, 466.93)
})

test("cobranca esperada sem garagem contratada e o proprio aluguel, nunca inferida", () => {
  const row = statusFor(
    prestacaoFixture({ receita: { inquilino: "Inquilino", aluguel: 700, total: 700 } }),
    700,
  )
  assert.equal(row.cobranca_esperada, 700)
})

test("receita variavel nao tem cobranca esperada", () => {
  const row = statusFor(
    prestacaoFixture({ receita: { inquilino: "AIRBNB", aluguel: 0, total: 0 } }),
    null,
  )
  assert.equal(row.cobranca_esperada, null)
})

test("garagem recebida da competencia e persistida separada do aluguel", () => {
  const row = statusFor(
    prestacaoFixture({
      receita: { inquilino: "Inquilino", aluguel: 414.86, garagem: 52.07, total: 466.93 },
    }),
    414.86,
  )

  assert.equal(row.garagem_recebida, 52.07)
})

test("checksum e canonico: independe da ordem das chaves e de campo opcional ausente", () => {
  // A causa raiz de quatro divergencias: builder e verificador mantem listas de
  // campos a mao. Com JSON.stringify puro, trocar a ordem ou omitir um campo
  // opcional muda o hash e o verificador acusa divergencia que nao existe.
  const base = {
    imovel_id: "a", fechamento_id: "b", competencia: "2026-07-01",
    status_ocupacao: "vago" as const, status_origem: "x", inquilino_nome: null,
    aluguel_esperado: 400, aluguel_esperado_origem: "vigencia" as const,
    aluguel_recebido: 0, receita_total: 0, desconto: null,
    comissao_administracao: null, repasse_apurado: null,
    vencimento_referencia: null, quantidade_linhas: 1,
    origem: "processamento" as const, qualidade: "completo" as const,
    calculo_versao: "v", cobranca_esperada: 400, garagem_recebida: null,
  }
  const trocado = {
    garagem_recebida: null, cobranca_esperada: 400, calculo_versao: "v",
    qualidade: "completo" as const, origem: "processamento" as const,
    quantidade_linhas: 1, vencimento_referencia: null, repasse_apurado: null,
    comissao_administracao: null, desconto: null, receita_total: 0,
    aluguel_recebido: 0, aluguel_esperado_origem: "vigencia" as const,
    aluguel_esperado: 400, inquilino_nome: null, status_origem: "x",
    status_ocupacao: "vago" as const, competencia: "2026-07-01",
    fechamento_id: "b", imovel_id: "a",
  }
  assert.equal(
    createIndicadoresSnapshotChecksum(base),
    createIndicadoresSnapshotChecksum(trocado),
  )
  // Campo opcional ausente equivale a nulo explicito.
  assert.equal(
    createIndicadoresSnapshotChecksum({ ...base, eventos: undefined }),
    createIndicadoresSnapshotChecksum(base),
  )
})
