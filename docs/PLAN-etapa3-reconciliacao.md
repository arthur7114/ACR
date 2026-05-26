# PLAN - Etapa 3: Extração Completa, Validações e Resolução de Conflitos (Otimização de Custos)

Este plano descreve a implementação da **Etapa 3 (Extração Completa, Validações e Aprovação)** com foco em **reduzir custos de IA em até 95%** e fornecer uma **interface de resolução de conflitos** em tempo real na tela de revisão.

---

## User Review Required

> [!IMPORTANT]
> **Resolução de Conflitos na Tela de Revisão**
> Implementaremos uma interface de reconciliação em que o usuário poderá clicar em "Resolver" ao lado de qualquer divergência financeira. O modal de resolução permitirá aceitar o valor determinístico calculado por código, manter o valor extraído pela IA, ou digitar um valor customizado. Uma justificativa textual será obrigatória e gravada para auditoria.

> [!TIP]
> **Estratégia de Redução de Custos (Modelos Híbridos & Parser Local)**
> - **Redução de 95% do custo** nos comprovantes, despesas e classificação ao migrar de `gpt-5.5` para o modelo super econômico `gpt-4o-mini`.
> - **Parser de XLSX local**: Arquivos de planilhas `.xlsx` serão lidos diretamente no servidor Node.js (sem IA), cortando custos a zero e garantindo 100% de precisão.

---

## Proposed Changes

### 1. Database & Migrations

#### [NEW] [202605260001_auditoria_reconciliacao.sql](file:///Users/beatrizmartins/Dev/ACR/supabase/migrations/202605260001_auditoria_reconciliacao.sql)
- Cria a tabela `auditoria_correcoes` para registrar o histórico de auditoria exigido pelo critério CA12 (autor, data/hora, campo, valor anterior, valor novo e justificativa).
- Adiciona colunas `resolvido_em` e `resolvido_por` na tabela `validacoes`.

---

### 2. Otimização de Custos (IA & Parser Local)

#### [MODIFY] [AI Agent Configs](file:///Users/beatrizmartins/Dev/ACR/lib/server/ai-agents/)
- Alterar o `defaultModel` em:
  - `document-classifier-agent.ts` -> `gpt-4o-mini`
  - `repasse-agent.ts` -> `gpt-4o-mini`
  - `despesas-agent.ts` -> `gpt-4o-mini`
  - `reajuste-agent.ts` -> `gpt-4o-mini`
- Manter o `prestacao-alive-agent.ts` no `gpt-5.5` ou `gpt-5.4` devido à complexidade da leitura das tabelas de múltiplos apartamentos.

#### [NEW] [excel-parser.ts](file:///Users/beatrizmartins/Dev/ACR/lib/server/excel-parser.ts)
- Implementar um parser local utilizando a biblioteca `xlsx` para extrair dados financeiros diretamente de planilhas `.xlsx` de locação, ignorando chamadas de IA para estes tipos de arquivos.

#### [MODIFY] [analyze-package-documents.ts](file:///Users/beatrizmartins/Dev/ACR/lib/server/analyze-package-documents.ts)
- Integrar a leitura de arquivos planilhas Excel via `excel-parser.ts`.
- Expandir a cobertura do Mock Mode para retornar as despesas simuladas (ENEL, CAGECE, IPTU) e reajustes quando `MOCK_IA=true` estiver ativado.

---

### 3. Mecanismo de Resolução de Conflitos

#### [NEW] [resolver route.ts](file:///Users/beatrizmartins/Dev/ACR/app/api/validacoes/[id]/resolver/route.ts)
- Endpoint `POST` para receber a resolução de uma divergência:
  - Salva a justificativa, atualiza o status da linha na tabela `validacoes` para `resolvida`.
  - Registra a auditoria na tabela `auditoria_correcoes`.
  - Recalcula a diferença do repasse e atualiza a movimentação ou cabeçalho do fechamento se aplicável.

#### [NEW] [resolve-conflict-modal.tsx](file:///Users/beatrizmartins/Dev/ACR/components/acr/resolve-conflict-modal.tsx)
- Modal com:
  - Exposição clara do conflito (Valor Calculado vs. Valor Extraído).
  - Seleção de qual valor assumir.
  - Campo de texto obrigatório para a justificativa.

#### [MODIFY] [revisao-view.tsx](file:///Users/beatrizmartins/Dev/ACR/components/acr/views/revisao-view.tsx)
- Renderizar o botão "Resolver" nas linhas de divergências da aba.
- Integrar o `ResolveConflictModal` e disparar requisição para a API de resolução.
- Bloquear o botão "Aprovar Fechamento" se houver alguma validação bloqueante com status `aberta`.

---

## Verification Plan

### Automated Tests
- Validar as rotas de API criadas e a conciliação:
  ```bash
  pnpm test
  ```

### Manual Verification
1. Rodar a aplicação com `NEXT_PUBLIC_MOCK_IA=true`.
2. Criar um fechamento, subir os arquivos de teste (incluindo o XLSX).
3. Na tela de revisão, simular uma divergência financeira.
4. Clicar em "Resolver", selecionar o valor correto e justificar.
5. Confirmar que a divergência foi limpa, o botão de aprovação foi liberado e o log de auditoria foi persistido na tabela.
