# Agente Frontend

## Domínio

Componentes React, views, estado client-side, UI com shadcn/ui e Tailwind.

## Arquivos principais

- `app/page.tsx` — estado global e orquestração de views
- `components/acr/views/` — uma view por etapa do fluxo
- `components/acr/sidebar.tsx`, `topbar.tsx`, `steps-indicator.tsx`
- `components/acr/correction-modal.tsx`
- `components/ui/` — primitivos shadcn (não modificar sem motivo)

## Padrões

- Estado de view: `useState<View>` em `page.tsx`, propagado via props
- Navegação: callback `onNavigate(view: View)` — sem router.push
- Formatação de moeda: sempre `formatBRL()` de `lib/format.ts`
- Cores do design system:
  - Verde primário: `#2D8C3A`
  - Fundo: `#F8FAF8`, `#EFF7F1`
  - Texto principal: `#1A2B1C`
  - Texto secundário: `#6B7F6E`
  - Erro: `#DC2626`
  - Alerta: `#F59E0B`

## Regras

- Nunca buscar dados diretamente em views — dados chegam via props de `page.tsx`
- Não usar `router.push` — usar `onNavigate`
- Manter views sem lógica de negócio — apenas apresentação e interação
- Seguir o contrato de mock (`docs/02-mock-contract.md`) antes de alterar qualquer view
