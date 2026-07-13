import assert from "node:assert/strict"
import test from "node:test"
import type { PackageAnalysis } from "@/lib/prestacao-types"
import { buildIndicadoresSnapshotRows } from "./indicadores-snapshots.ts"

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

test("distingue zero ambiguo de vacancia explicita no inquilino ou observacao", () => {
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

  assert.equal(result.rows.find((row) => row.imovel_id === "imovel-101")?.status_ocupacao, "desconhecido")
  assert.equal(result.rows.find((row) => row.imovel_id === "imovel-102")?.status_ocupacao, "vago")
  assert.equal(result.rows.find((row) => row.imovel_id === "imovel-103")?.status_ocupacao, "vago")
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
