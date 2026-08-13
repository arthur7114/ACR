import assert from "node:assert/strict"
import test from "node:test"
import { syncImoveisFromFechamentos } from "./sync-imoveis.ts"

class FakeQuery implements PromiseLike<{ data: unknown[]; error: null }> {
  constructor(private readonly data: unknown[]) {}

  select() { return this }
  eq() { return this }
  in() { return this }
  order() { return this }

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.data, error: null }).then(onfulfilled, onrejected)
  }
}

test("sincronização atualiza GA0002 quando o fechamento mais recente usa GA0002/2", async () => {
  const fakeSupabase = {
    from(table: string) {
      if (table === "fechamentos") {
        return new FakeQuery([
          {
            competencia: "2026-07-01",
            imobiliaria_id: "plural",
            empreendimento_id: "jose-walter",
            analise_completa: {
              prestacao: {
                receitas_por_imovel: [
                  {
                    apto: "GA0002/2",
                    inquilino: "Galpão José Walter",
                    aluguel: 3_348.52,
                    total: 3_348.52,
                    observacao: null,
                  },
                ],
              },
            },
          },
        ])
      }
      return {
        select() {
          return new FakeQuery([
            {
              id: "imovel-ga0002",
              imobiliaria_id: "plural",
              empreendimento_id: "jose-walter",
              unidade: "GA0002",
            },
          ])
        },
        update() {
          return new FakeQuery([])
        },
        insert() {
          return new FakeQuery([])
        },
      }
    },
  }

  const result = await syncImoveisFromFechamentos({}, fakeSupabase as never)

  assert.deepEqual(result, { criados: 0, atualizados: 1, totalUnidades: 1 })
})
