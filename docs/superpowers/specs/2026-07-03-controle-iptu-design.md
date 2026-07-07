# Controle de Pagamento de IPTU — Design

**Data:** 2026-07-03
**Status:** LEGADO / fora do MVP (desde 2026-07-07)

> **⚠️ LEGADO:** o fluxo de importacao de certidao/PDF por IA descrito aqui deixou de ser a experiencia principal de `/iptu`, que passou a ser um controle operacional manual de contas a pagar (ver `docs/02-mock-contract.md` e o ciclo de 2026-07-07 em `docs/12-execution-roadmap.md`). Backend de importacao mantido por compatibilidade, sem acesso na UI.

## Contexto

A imobiliária gera os boletos de IPTU, encaminha aos inquilinos e acompanha os pagamentos. Mensalmente ela envia uma certidão/relatório (PDF) informando quantas parcelas do carnê de IPTU já foram quitadas por apartamento.

Regra de responsabilidade:
- Apartamento **ocupado** → IPTU é responsabilidade do **inquilino**.
- Apartamento **desocupado** → IPTU é responsabilidade do **proprietário**; o valor pago nesse período é abatido do faturamento (planilha de controle já existente).

Este módulo serve **apenas como registro e controle histórico** — para identificar corretamente, mês a mês, quais parcelas caem em período de vacância. Ele não substitui nem gera automaticamente o lançamento de despesa no eGestor: os valores que já aparecem como despesa na planilha/resumo financeiro continuam sendo integrados ao eGestor pelo fluxo existente (`lib/despesas-locador.ts` → `reconciliarResumoDespesas`). Este controle de IPTU é uma fonte de apoio/auditoria para justificar quais parcelas são do proprietário, não a fonte que dispara o lançamento contábil.

## Decisões confirmadas com o usuário

1. **Escopo eGestor:** registro passivo. Nenhum lançamento é criado automaticamente a partir deste módulo.
2. **Fonte de ocupação:** usa o campo `imoveis.status` (já existente) **no momento da importação** — não se tenta reconstruir retroativamente o status histórico do imóvel (o histórico existente, `lib/server/imovel-historico.ts`, é derivado de fechamentos e tem lacunas mensais, então não é confiável para isso). Essa escolha aceita alguma imprecisão em trocas de status não capturadas a tempo; o mecanismo de correção manual (seção 5) existe justamente para cobrir esse caso.
3. **Formato do arquivo:** PDF (certidão/extrato), formato pode variar por imobiliária. Requer extração via IA, nos moldes de `lib/server/analyze-prestacao.ts`, mas sem o workflow Mastra de 4 passos — não há recheck determinístico complexo nem geração de lançamento contábil aqui.
4. **Estrutura de parcelas:** carnê anual com N parcelas fixas por imóvel (tipicamente 10). N é configurável por carnê (ver seção 3), não hardcoded globalmente.
5. **Escopo do PDF:** pode cobrir um ou vários apartamentos no mesmo documento — a extração deve suportar ambos os casos.
6. **Localização na navegação:** módulo novo e independente (`/iptu`), fora do fluxo de upload/análise de prestação de contas.
7. **Estilo de execução na implementação:** ao construir a UI, iterar em ciclo build → subir dev server/preview no navegador → screenshot/inspeção → ajuste → rodar testes, em vez de escrever a tela sem verificação visual.

## 1. Arquitetura geral

Segue o padrão já usado por `imoveis`/`cadastros` no projeto (`app/(app)/imoveis/page.tsx` + `components/acr/views/imoveis-view.tsx` + `lib/contexts/cadastros-context.tsx`):

- **UI:** `app/(app)/iptu/page.tsx` (client component) → `components/acr/views/iptu-view.tsx`, com `lib/contexts/iptu-context.tsx` para carregar dados e disparar importação.
- **API:**
  - `POST /api/iptu/importar` — recebe PDF + `empreendimento_id`, dispara extração e persiste.
  - `GET /api/iptu?empreendimento_id=...` — lista carnês/parcelas para exibição.
  - `PATCH /api/iptu/parcelas/[id]` — edição manual de `responsavel` de uma parcela.
  - `PATCH /api/iptu/carnes/[id]` — edição manual de `numero_parcelas`.
- **Extração:** `lib/server/analyze-iptu.ts` — chamada direta à OpenAI (`client.responses.create`) com JSON Schema pequeno, sem workflow Mastra.
- **Persistência e lógica de negócio:** `lib/server/persist-iptu.ts` (I/O com Supabase) + `lib/iptu-logic.ts` (funções puras testáveis: cálculo de delta e de responsável — ver seção 6).
- **Tipos:** `lib/iptu-types.ts` — Zod schemas do payload de extração e das entidades persistidas.
- **Migration:** nova migration em `supabase/migrations/` com as tabelas da seção 3.

Este módulo é desacoplado do fluxo de prestação de contas (que tem ciclo de vida próprio, mensal, por empreendimento).

## 2. Modelo de dados

### `iptu_carnes` — um carnê anual por imóvel

| coluna | tipo | obs |
|---|---|---|
| `id` | uuid pk | |
| `imovel_id` | uuid fk → `imoveis(id)` | |
| `ano_referencia` | int | ano fiscal do IPTU |
| `numero_parcelas` | int | ex: 10; editável manualmente na UI |
| `created_at` / `updated_at` | timestamptz | |

Constraint: `unique (imovel_id, ano_referencia)`.

### `iptu_parcelas` — uma linha por parcela do carnê

| coluna | tipo | obs |
|---|---|---|
| `id` | uuid pk | |
| `carne_id` | uuid fk → `iptu_carnes(id)` | |
| `numero` | int | 1..N |
| `pago` | boolean default false | |
| `responsavel` | text enum: `inquilino` \| `proprietario`, nullable | preenchido só quando `pago=true`; editável manualmente |
| `status_imovel_no_registro` | text | snapshot bruto de `imoveis.status` no momento em que foi marcada como paga (auditoria; nunca sobrescrito por edição manual de `responsavel`) |
| `origem_importacao_id` | uuid fk → `iptu_importacoes(id)`, nullable | qual importação marcou esta parcela |
| `registrado_em` | timestamptz | quando foi marcada como paga |

Constraint: `unique (carne_id, numero)`.

### `iptu_importacoes` — log de cada certidão importada

| coluna | tipo | obs |
|---|---|---|
| `id` | uuid pk | |
| `empreendimento_id` | uuid fk | |
| `arquivo_nome` | text | |
| `arquivo_path` | text | caminho no Supabase Storage |
| `competencia_relatorio` | text | MM/YYYY, mês de referência informado no relatório |
| `resultado_bruto` | jsonb | payload extraído pela IA (auditoria/reprocessamento) |
| `apartamentos_nao_vinculados` | jsonb | unidades citadas no PDF sem `imovel` correspondente |
| `anomalias` | jsonb | lista de `{ unidade, tipo: "regressao" \| "excede_carne", detalhe }` |
| `criado_em` | timestamptz | |

### Vinculação apartamento ↔ imóvel

Por chave exata `(imobiliaria_id, empreendimento_id, unidade)`, mesmo padrão de `lib/server/sync-imoveis.ts:81-115` — string trimada, comparação exata, sem normalização difusa.

## 3. Fluxo de importação e cálculo de responsabilidade

1. Operador abre "Controle de IPTU", escolhe o empreendimento, sobe o PDF mensal.
2. `POST /api/iptu/importar` salva o PDF no Supabase Storage e chama `analyzeIptu()`, que pede à OpenAI:
   ```json
   {
     "competencia_relatorio": "MM/YYYY",
     "apartamentos": [
       { "unidade": "string", "parcelas_pagas": 0, "ano_carne": null }
     ]
   }
   ```
3. Para cada apartamento retornado:
   - Resolve `imovel_id` por `(imobiliaria_id, empreendimento_id, unidade)`. Se não encontrar: adiciona a `apartamentos_nao_vinculados` e segue para o próximo (não aborta a importação inteira).
   - Resolve `ano_referencia` = `ano_carne` extraído, ou o ano de `competencia_relatorio` se `ano_carne` vier nulo.
   - Busca ou cria `iptu_carnes` de `(imovel_id, ano_referencia)`. Se novo, `numero_parcelas` recebe o padrão configurável `IPTU_PARCELAS_PADRAO = 10` (constante em `lib/iptu-logic.ts`), editável depois.
   - Calcula `delta = parcelas_pagas (informado) − count(iptu_parcelas do carnê onde pago=true)`.
   - Se `delta > 0`: cria/atualiza as parcelas de número `(atual+1)` até `min(parcelas_pagas, numero_parcelas)`, cada uma com `pago=true`, `responsavel` pela tabela abaixo, `status_imovel_no_registro = imoveis.status` atual, `origem_importacao_id`. Se `parcelas_pagas > numero_parcelas`, registra anomalia `excede_carne`.
   - Se `delta <= 0`: nenhuma parcela nova é criada. Se `delta < 0`, registra anomalia `regressao` (não desfaz parcelas já marcadas como pagas).
4. Grava o registro em `iptu_importacoes` com `resultado_bruto`, `apartamentos_nao_vinculados` e `anomalias`.
5. Retorna resumo ao frontend: quantidade de parcelas novas registradas, unidades não vinculadas, anomalias.

### Tabela de responsabilidade (`lib/iptu-logic.ts::calcularResponsavel`)

| `imoveis.status` | responsável |
|---|---|
| `ocupado` | `inquilino` |
| `inadimplente` | `inquilino` (ocupado, só em atraso de aluguel) |
| `em_negociacao` | `inquilino` (ocupado, em renegociação) |
| `vago` | `proprietario` |
| `em_rescisao` | `proprietario` (tratado como transição para vacância) |
| `inativo` | `null` — não determina automaticamente, cai como pendência de revisão manual |

## 4. Casos de borda e tratamento de erros

| Situação | Tratamento |
|---|---|
| Unidade do PDF sem `imovel` correspondente | Não falha a importação inteira; registrada em `apartamentos_nao_vinculados`; UI alerta para vínculo/correção manual. |
| Delta negativo | Não desfaz parcelas já pagas; registrada como anomalia `regressao` para investigação manual. |
| `parcelas_pagas` informado > `numero_parcelas` do carnê | Grava até `numero_parcelas`; registrada como anomalia `excede_carne`; operador pode corrigir `numero_parcelas` e reprocessar. |
| Falha na extração da IA / PDF ilegível | Importação inteira falha, nada é gravado parcialmente; operador pode tentar novamente. Sem recheck determinístico (diferente do fluxo de prestação). |
| Status `inativo` no momento do registro | `responsavel = null`; parcela fica marcada como `pago=true` mas pendente de definição manual de responsável. |
| Correção manual de responsável | Operador edita `responsavel` de uma parcela específica via `PATCH /api/iptu/parcelas/[id]`. Só é permitido em parcelas com `pago=true` (400 se `pago=false`). `status_imovel_no_registro` nunca é sobrescrito (mantém o snapshot original para auditoria). |
| Reimportação do mesmo mês/arquivo | Idempotente pela natureza do cálculo por delta — reimportar o mesmo total não gera duplicidade. |
| Redução de `numero_parcelas` abaixo da quantidade já paga | `PATCH /api/iptu/carnes/[id]` rejeita (400) se o novo `numero_parcelas` for menor que `count(iptu_parcelas onde pago=true)` do carnê. |

## 5. UI

Route `app/(app)/iptu/page.tsx` → `components/acr/views/iptu-view.tsx` (view "burra": recebe dados e callbacks; `lib/contexts/iptu-context.tsx` cuida de fetch/estado).

- Seletor de empreendimento (reaproveita lista de `cadastros-context`).
- Upload do PDF mensal da certidão.
- Resumo pós-importação inline: parcelas novas registradas, unidades não vinculadas, anomalias.
- Tabela por apartamento: unidade, inquilino atual, ano do carnê, progresso (`6/10 parcelas pagas`), contagem "X do proprietário / Y do inquilino".
- Detalhe expandido por apartamento: lista das parcelas individuais (número, paga/pendente, responsável, competência do registro), com edição manual de responsável e de `numero_parcelas` do carnê.
- Seção/aba de histórico de importações e pendências de vínculo não resolvidas.

Sem integração de navegação com o fluxo de fechamento/prestação existente.

## 6. Testes

Padrão de `lib/despesas-locador.test.ts` — funções puras testadas isoladamente, sem mockar banco.

**`lib/iptu-logic.ts` (lógica pura):**
- `calcularResponsavel(status)` — cobre todos os valores de `ImovelStatus`.
- `calcularNovasParcelas(parcelasPagasAtual, parcelasPagasInformado, numeroParcelasCarne)` → `{ novasParcelas: number[], anomalia: "regressao" | "excede_carne" | null }` — cobre delta positivo, delta zero (idempotência), delta negativo, informado > numero_parcelas.
- Resolução de unidade → `imovel_id`: match exato e caso "não encontrado".

**`lib/server/analyze-iptu.ts`:**
- Mock de resposta OpenAI; valida schema Zod aceitando payload válido e rejeitando payload malformado.

**`app/api/iptu/importar/route.ts` (integração leve, OpenAI mockada):**
- Todas as unidades vinculadas.
- Unidade não vinculada (não falha a rota, retorna pendência).
- Reimportação do mesmo mês (idempotência).

**Fora de escopo para testes automatizados:** qualidade de extração de PDFs reais variados — validado manualmente com exemplos reais, como já é feito para os layouts de prestação de contas.

## Fora de escopo (nesta iteração)

- Geração automática de lançamento no eGestor a partir deste módulo.
- Reconstrução de histórico de ocupação retroativo (períodos de ocupação com datas de início/fim).
- Extração de valores monetários das parcelas (o controle é de quantidade/status, não de valor).
