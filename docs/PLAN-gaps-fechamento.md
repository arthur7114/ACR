# PLAN - Gaps de Revisão e Checklist de Fechamento (Etapa 4 - UX/Produto)

Este plano descreve as melhorias de UX e produto na tela de revisão de fechamentos imobiliários. O objetivo é transformar a interface em uma ferramenta de tomada de decisão guiada por exceção, adicionando rastreabilidade nos cálculos, buscas e filtros, histórico básico, agrupamentos, comentários internos e um checklist de pendências integrado.

---

## Overview do Projeto

- **Project Type**: WEB (Next.js + React + Tailwind CSS + Supabase)
- **Escopo**: Foco exclusivo em aprimorar a tela de revisão (`revisao-view.tsx`) e APIs associadas, incorporando as decisões da reunião de alinhamento.
- **Exclusões**: Envio real ao eGestor e alertas de tendências de IA estão adiados para fases futuras (Fase 2 / Fase 3).

---

## Decisões do Socratic Gate

1. **Checklist de Aprovação (Gap 1 & 4)**: Será integrado diretamente na seção de "Pendências de Revisão" no formato de um status dinâmico derivado de validações de negócio reais do backend.
2. **Explicação do Cálculo e Prova Documental (Gap 2 & 10)**: Serão implementados utilizando **Tooltips interativos** (balões de ajuda) inline nas células e cards financeiros, extraindo informações estruturadas da análise do pacote sem carregar PDFs completos lado a lado.
3. **Histórico Mensal por Unidade (Gap 3)**: Adição de exibição básica do histórico de fechamentos anteriores do mesmo par imobiliária + empreendimento na tela inicial de fechamentos ou painel da revisão.
4. **Exportação e Tendências (Gap 7 & 11)**: Removidos do escopo desta fase por definição de prioridade do usuário.
5. **Comentários Internos (Gap 13)**: Salvos no nível do fechamento como um todo. Adicionaremos o campo `comentario_operador` na tabela `fechamentos` do Supabase.

---

## Success Criteria

1. **Checklist Visível**: O painel de parecer técnico exibe de forma clara se o fechamento cumpriu as condições de aprovação (prestação anexada, comprovante anexado, divergências resolvidas).
2. **Navegabilidade**: O operador consegue buscar um imóvel específico ou filtrar por status (Ex: "Inadimplentes", "Vagos", "Com divergência") na tabela de receitas com resposta instantânea.
3. **Rastreabilidade (Tooltips)**: Cada card do cabeçalho de receitas/comissão e cada item de despesa ou acordo exibe um tooltip explicativo (Ex.: demonstrando de onde veio o valor ou exibindo o texto de origem extraído pela IA).
4. **Comentários Persistidos**: O operador pode redigir notas de fechamento que persistem ao recarregar a página.

---

## File Structure

```
supabase/
└── migrations/
    └── 202606030002_comentarios_fechamento.sql  [NEW] -> Adiciona comentário de operador
lib/
└── prestacao-types.ts                           [MODIFY] -> Adiciona tipagem de comentário e novos campos de recheck
app/
└── api/
    └── fechamentos/
        └── [id]/
            └── route.ts                         [MODIFY] -> Salva comentários do fechamento
components/
└── acr/
    └── views/
        └── revisao-view.tsx                     [MODIFY] -> Adiciona tooltips, busca, filtros, agrupamentos e comentários
```

---

## Proposed Changes

### 1. Database & Migrations

#### [NEW] [202606030002_comentarios_fechamento.sql](file:///Users/beatrizmartins/Dev/ACR/supabase/migrations/202606030002_comentarios_fechamento.sql)
- Adiciona a coluna `comentario_operador text` na tabela `public.fechamentos`.

---

### 2. Backend & APIs

#### [MODIFY] [route.ts (GET & POST/PATCH)](file:///Users/beatrizmartins/Dev/ACR/app/api/fechamentos/[id]/route.ts)
- Suporta a leitura da nova coluna `comentario_operador`.
- Adiciona suporte no endpoint `POST`/`PATCH` do fechamento para salvar a observação/comentário inserida pelo operador no fechamento.

#### [MODIFY] [package-rechecks.ts](file:///Users/beatrizmartins/Dev/ACR/lib/server/package-rechecks.ts)
- Garante que a execução do parecer técnico alimente a lista de pendências com status dinâmicos que representem o checklist de aprovação operacional.

---

### 3. Frontend / UI Improvements

#### [MODIFY] [revisao-view.tsx](file:///Users/beatrizmartins/Dev/ACR/components/acr/views/revisao-view.tsx)

##### A. Busca e Filtro de Imóveis (Gap 8)
- Adicionar uma barra de pesquisa (`Input` simples de texto) acima da tabela "Receitas por imóvel".
- Adicionar botões de filtro rápido (Todos, Alugados, Inadimplentes, Vagos, Com pendências) para filtrar localmente a lista de `linhasImoveis` renderizada no corpo da tabela.

##### B. Agrupamento de Despesas (Gap 9)
- Modificar a seção "Despesas extraídas" para mostrar uma lista inicial sumarizada por categorias comuns (Energia, Água, IPTU, Seguros, Outros) e uma lista expansível com a quebra das notas fiscais e comprovantes originais.

##### C. Rastreabilidade com Tooltips (Gap 2 e 10)
- Integrar componentes de `Tooltip` (ou balões nativos formatados via CSS) nos cards financeiros superiores e nos itens detalhados da prestação de contas.
- No card de comissão administrativa: exibir a base utilizada (total de receitas) e o percentual cadastrado na regra comercial.
- Nas linhas de despesas ou acordos da tabela: passar o mouse exibe o snippet de texto que motivou a extração pelo agente de IA.

##### D. Caixa de Comentário Operacional (Gap 13)
- Adicionar uma caixa de texto (`Textarea`) persistente no fechamento permitindo que o operador insira notas manuais separadas das observações dos documentos. Salvar as alterações automaticamente com um debounce ou botão dedicado.

##### E. Hierarquia Visual (Gap 6)
- Remover visualmente a confusão entre valores técnicos e financeiros: remover badges de percentuais brutos de confiança de IA dos elementos financeiros operacionais centrais e limitá-los à seção colapsada de "Leitura do documento" ou no tooltip de qualidade técnica de OCR.

##### F. Comparativo Imobiliária x Regra (Gap 12)
- Criar um painel simples de comparação rápida para mostrar se há recorrências frequentes ou divergências habituais daquela imobiliária.

---

## Verification Plan

### Automated Tests
1. **Lints & Types Check**:
   ```bash
   pnpm exec tsc --noEmit && pnpm lint
   ```
2. **Test Suite**:
   ```bash
   pnpm test
   ```

### Manual Verification
1. Criar novo fechamento e rodar processamento no modo simulado (`NEXT_PUBLIC_MOCK_IA=true`).
2. Abrir a tela de revisão e verificar se a barra de pesquisa filtra corretamente os imóveis por número do apartamento e inquilino.
3. Clicar nos botões de filtros rápidos para testar a filtragem por status (Vago / Inadimplente).
4. Passar o mouse sobre os cards superiores para verificar se a explicação de fórmula do cálculo é renderizada no tooltip.
5. Inserir um comentário na caixa de anotação de fechamento, recarregar a página e confirmar que o texto continua salvo através da chamada de API.
