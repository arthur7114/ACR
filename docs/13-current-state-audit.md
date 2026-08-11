# 13 - Current State Audit

## Repositorio

Raiz atual: `ACR`.

Itens relevantes:

- `.agent`: harness Antigravity copiado e commitado.
- `AGENTS.md`: entrada principal de instrucoes do harness.
- `docs/PRD_Modulo_Fechamento_Imobiliario_v0.3.md`: PRD completo.
- `acr-fechamentos-app`: mock Next.js do modulo de fechamentos.
- `docs/Artefatos`: arquivos reais de referencia para extracao.

## Mock disponivel

O mock esta em `acr-fechamentos-app` e usa:

- Next.js 16;
- React 19;
- Tailwind CSS 4;
- shadcn/ui/Radix;
- lucide-react;
- pnpm lockfile.

Componentes principais:

- `components/acr/sidebar.tsx`
- `components/acr/topbar.tsx`
- `components/acr/views/fechamentos-view.tsx`
- `components/acr/views/novo-fechamento-view.tsx`
- `components/acr/views/upload-view.tsx`
- `components/acr/views/processando-view.tsx`
- `components/acr/views/revisao-view.tsx`
- `components/acr/correction-modal.tsx`

## Artefatos reais

- `1. PRESTACAO DE CONTAS MARCO 2026 GM II (1).pdf`: fixture principal do primeiro fluxo real; usado para extrair a Secao 1 por apartamento.
- `2. REPASSE MARCO 2026 GM II.pdf`: comprovante de repasse; fica para o proximo slice de conciliacao.
- `3. RELATORIO LOCACAO MARCO 2026 - GM2 (1).pdf`: relatorio de locacao/reajuste; fixture futura.
- `4. DESPESAS MARCO 2026 GM II.pdf`: despesas e comprovantes; fixture futura.
- `CAIXA ADMINISTRACAO LOCACAO - GM II (1).xlsx`: planilha de administracao; fixture futura.
- `extratoagrupado - cesar rego - REF 03-26 (1).pdf`: layout Cesar Rego futuro.
- `extratoagrupado - PLURAL - REF 03-26 (1).pdf`: layout Plural futuro.

## Estado funcional atual

- Mock segue como contrato visual/funcional.
- Navegacao interna usa estado local `currentView`.
- Ha migracao inicial Supabase para fechamentos, documentos, movimentacoes e validacoes.
- Auth e RBAC estão ativos no middleware e reforçados na resolução bloqueante:
  `visualizador`, `operador`, `aprovador` e `admin`, com ausência de perfil em
  modo somente leitura.
- Ha endpoint Next para upload real de PDF de prestacao, workflow Mastra, chamada OpenAI encapsulada no step de extracao e persistencia em Supabase Storage/banco.
- A revisao renderiza dados extraidos quando a analise existe, mantendo fallback mockado e exibindo parecer tecnico, rechecks e guardrails.
- `.env` local foi preenchido pelo usuario e esta ignorado pelo Git.
- Supabase MCP foi instalado/autenticado como `supabase`.
- Supabase CLI foi linkado ao projeto `qeblersdkfzsogqptbdh` (`Auditor de repasses`) e a migracao inicial foi aplicada.
- API real validada com a prestacao Alive / GM II: extraiu 27 imoveis, gravou Storage/documento/movimentacoes, persistiu parecer tecnico e bloqueou por divergencia deterministica de R$ 0,05 em `total_receitas`.
- Ainda nao ha Edge Function; o primeiro slice roda em API Route Next.
- Ha recheck deterministico inicial para totais, linhas extraidas e confianca; ainda nao ha conciliacao com comprovante de repasse.

## Lacunas antes da Etapa 1

- Definir estrutura oficial de empreendimentos e imoveis.
- Definir codigos internos ou por imobiliaria.
- Definir regra de aprovacao com bloqueante justificada.
- Definir se fechamento sem comprovante de repasse sera aceito.
- Definir fonte inicial/importacao de imoveis.
- Definir obrigatoriedade de comprovante para despesas.

## Como atualizar este doc

Atualize quando o estado real do repo mudar de forma relevante, especialmente depois de setup Supabase, alteracao de stack, alteracao grande no mock ou entrada de backend real.
