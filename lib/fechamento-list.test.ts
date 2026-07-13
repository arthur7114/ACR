import assert from "node:assert/strict"
import test from "node:test"
import { resolveFechamentoListPresentation } from "./fechamento-list"

test("rascunho sem job aguarda documentos e abre o upload", () => {
  const result = resolveFechamentoListPresentation({
    id: "fechamento-1",
    dbStatus: "rascunho",
    processamentoStatus: null,
    processamentoAtualizadoEm: null,
    agora: "2026-07-13T17:00:00Z",
  })

  assert.deepEqual(result, {
    status: "rascunho",
    href: "/fechamentos/fechamento-1/upload",
    actionLabel: "Enviar documentos",
  })
})

test("rascunho com job ativo acompanha o processamento", () => {
  const result = resolveFechamentoListPresentation({
    id: "fechamento-1",
    dbStatus: "rascunho",
    processamentoStatus: "processando",
    processamentoAtualizadoEm: "2026-07-13T16:55:00Z",
    agora: "2026-07-13T17:00:00Z",
  })

  assert.deepEqual(result, {
    status: "processando",
    href: "/fechamentos/fechamento-1/processando",
    actionLabel: "Acompanhar",
  })
})

test("falha de processamento permite reenviar os documentos", () => {
  const result = resolveFechamentoListPresentation({
    id: "fechamento-1",
    dbStatus: "rascunho",
    processamentoStatus: "erro",
    processamentoAtualizadoEm: "2026-07-13T16:55:00Z",
    agora: "2026-07-13T17:00:00Z",
  })

  assert.deepEqual(result, {
    status: "erro_processamento",
    href: "/fechamentos/fechamento-1/upload",
    actionLabel: "Tentar novamente",
  })
})

test("fechamento processado abre a revisão", () => {
  const result = resolveFechamentoListPresentation({
    id: "fechamento-1",
    dbStatus: "processado_com_sucesso",
    processamentoStatus: "concluido",
    processamentoAtualizadoEm: "2026-07-13T16:55:00Z",
    agora: "2026-07-13T17:00:00Z",
  })

  assert.deepEqual(result, {
    status: "pendente",
    href: "/fechamentos/fechamento-1/revisao",
    actionLabel: "Revisar",
  })
})

test("job sem atualização há mais de 15 minutos permite nova tentativa", () => {
  const result = resolveFechamentoListPresentation({
    id: "fechamento-1",
    dbStatus: "rascunho",
    processamentoStatus: "processando",
    processamentoAtualizadoEm: "2026-07-13T16:44:59Z",
    agora: "2026-07-13T17:00:00Z",
  })

  assert.deepEqual(result, {
    status: "erro_processamento",
    href: "/fechamentos/fechamento-1/upload",
    actionLabel: "Tentar novamente",
  })
})
