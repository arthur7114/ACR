# Polimento pré-reunião — Dashboard, Configurações, Login, Logs e Imóveis

**Data:** 2026-07-03
**Status:** Aprovado para plano de implementação

## Contexto

Reunião de apresentação do sistema ACR marcada para acontecer em prazo muito curto. O pedido do usuário foi "retocar, polir e finalizar" o sistema como um todo, com destaque para: dashboard, configurações do admin, login, logs e gerenciamento/histórico de imóveis.

Mapeamento do estado atual (feito antes deste documento) mostrou que essas cinco áreas não estão no mesmo estágio de maturidade:

| Área | Estado antes deste spec |
|---|---|
| Dashboard (= tela de **Indicadores**, confirmado com o usuário) | Totalmente implementado, 4 sub-abas de KPIs |
| Configurações | Só cobre integração eGestor multi-conta; sem admin geral nem usuários |
| Login/Auth | **Não existe.** Nenhuma rota de login, nenhuma proteção de rota, nenhum Supabase Auth |
| Logs | Dados de auditoria existem no banco (`auditoria_correcoes`, `notificacoes`) mas sem tela própria |
| Gerenciamento/histórico de imóveis (tela "Imóveis") | Já implementado: CRUD de imóveis/imobiliárias/empreendimentos/regras comerciais + timeline por unidade |

Ou seja: três áreas (Dashboard, Imóveis, parte de Configurações) precisam só de **polimento visual**; duas (Login, Logs) precisam ser **construídas do zero**; e Configurações ganha uma peça nova (gestão de usuários) por decorrência do login real.

Durante o brainstorming, o usuário também pediu, à parte, que a seção "Prévia eGestor" da tela de Revisão (`components/acr/views/revisao-view.tsx`) passe a permitir editar **Valor** e **Etiquetas** dos lançamentos antes do envio — hoje só a Descrição é editável ali. Esse pedido foi incorporado à Camada 2 abaixo por ser a mesma área (Configurações/eGestor) e reaproveitar exatamente o mesmo padrão de edição inline já existente no código.

## Decisões tomadas com o usuário

- **Prazo:** muito curto; entrega deve ser organizada em camadas priorizadas, para que qualquer camada entregue fique completa e utilizável mesmo se o tempo acabar antes das últimas.
- **Login:** autenticação real via Supabase Auth (não uma tela cosmética), protegendo as rotas de fato. O projeto já tem `@supabase/supabase-js` e uma service role key configurada, o que reduz o esforço.
- **Logs:** tela cobrindo o que já é rastreado hoje — correções manuais (`auditoria_correcoes`) e eventos de notificação (`notificacoes`). Sem log de acesso/sessão por enquanto.
- **Gerenciamento de imóveis:** é a tela "Imóveis" que já existe. Não precisa reestruturar — só polir visualmente.
- **"Dashboard":** refere-se à tela de **Indicadores** (KPIs), não à lista de Fechamentos.
- **Usuários:** o usuário quer uma tela simples em Configurações para listar/criar usuários (não só contas fixas criadas direto no banco).
- **Direção visual:** manter a paleta ACR já aprovada no mock contract (tons ink/verde em `app/globals.css`), refinando contraste, espaçamento, sombras e estados — sem introduzir uma paleta nova.

## Abordagem

Entrega em camadas sequenciais, cada uma independente e completa, ordenadas por dependência e prioridade — não em paralelo "big bang":

```
Camada 0 (base visual) → Camada 1 (login) → Camada 2 (configurações) →
Camada 3 (logs) → Camada 4 (dashboard/indicadores) → Camada 5 (imóveis)
```

A Camada 0 vem primeiro porque toda tela nova ou repolida depende dela. A Camada 1 (login) vem antes da Camada 2 porque a tela de Usuários só faz sentido com autenticação real já funcionando. Camadas 3, 4 e 5 são independentes entre si e podem ser reordenadas ou cortadas sem afetar as anteriores caso o tempo aperte — isso deve ser sinalizado explicitamente se acontecer, não cortado silenciosamente.

Alternativa descartada: implementar tudo em paralelo sem ordem de dependência — maior risco de terminar com várias telas pela metade se o tempo acabar, em vez de um subconjunto delas completo e apresentável.

## Camada 0 — Sistema visual (base)

**Objetivo:** consistência visual em toda a aplicação, sem inventar uma paleta nova.

- Manter os tokens `--acr-*` já definidos em `app/globals.css:41-64` (aprovados no mock contract) como única fonte de cor.
- Padronizar escala de sombra para cards e elementos elevados (hoje inconsistente entre telas).
- Padronizar estados de hover/focus em botões, links e itens de navegação.
- Garantir contraste consistente nos badges de status (aprovado, pendente, erro, etc.) em todas as telas que os usam.
- Padronizar tratamento visual de estados vazio, erro e carregamento — hoje cada view resolve isso de um jeito diferente (ou não resolve).
- Sem mudança estrutural de layout, componente ou dado — só polimento de superfície.

## Camada 1 — Login real (Supabase Auth)

**Objetivo:** autenticação de acesso à aplicação (não autorização por linha de dado).

- Adicionar dependência `@supabase/ssr` (hoje só existe `@supabase/supabase-js`).
- Adicionar `NEXT_PUBLIC_SUPABASE_ANON_KEY` em `.env.local` / `.env.example` (hoje só há a service role key, server-side).
- Novo `lib/supabase/client.ts` (cliente browser) e `lib/supabase/server.ts` (cliente server com cookies via `@supabase/ssr`).
- Novo `middleware.ts` na raiz do projeto: redireciona para `/login` quando não há sessão; libera `/login` e assets estáticos.
- Nova rota `app/login/page.tsx`, fora do grupo `(app)`: formulário e-mail/senha com a identidade visual ACR, mensagens de erro claras.
- `components/acr/sidebar.tsx:88-94`: substitui o placeholder estático "Usuário / Sessão local" pelo nome/e-mail da sessão real, com ação de logout (`supabase.auth.signOut()` + redirect para `/login`).
- `components/acr/topbar.tsx:150`: remove o círculo cinza placeholder duplicado — a identidade do usuário passa a viver só na sidebar.
- Fora de escopo por ora: RLS (Row Level Security) nas tabelas e permissões por papel/role. As rotas continuam sendo servidas com a service role key no backend; o que muda é que a UI deixa de ser acessível sem login.

## Camada 2 — Configurações (Usuários + eGestor)

**Objetivo:** dar à tela de Configurações uma seção de administração de usuários, e resolver o pedido de edição da prévia eGestor.

### Usuários (nova aba)
- Nova aba "Usuários" ao lado do conteúdo eGestor existente, usando o componente `Tabs` (mesmo padrão já usado em `imoveis-view.tsx`).
- Lista usuários via Supabase Admin API (`createSupabaseAdmin().auth.admin.listUsers()`): nome/e-mail, data de criação, último acesso.
- Criação de usuário com senha temporária exibida uma única vez na tela para o admin repassar manualmente — mais rápido de entregar do que convite por e-mail, que dependeria de SMTP configurado no projeto Supabase (não verificado, provável ponto de atrito de última hora).
- Novos endpoints server-side: `GET /api/admin/usuarios` (lista) e `POST /api/admin/usuarios` (cria), usando `createSupabaseAdmin()` já existente em `lib/server/supabase.ts`.

### eGestor (polimento + edição estendida)
- Polish visual dos cards de conta eGestor existentes, seguindo a Camada 0.
- Na Prévia eGestor (`components/acr/views/revisao-view.tsx`, tabela a partir da linha ~1644), tornar **Valor** (coluna `:1703`) e **Etiquetas** (coluna `:1711`) editáveis, replicando o padrão inline já usado em Descrição (`:1658-1701`): clique em "editar" → campo de edição → Salvar/Cancelar.
- Backend: generalizar `updateEgestorLancamentoDescricao` (`lib/server/egestor.ts:785`) para aceitar também `valor` e `tags`, mantendo a mesma trava já existente — edição bloqueada quando `egestor_codigo` já está preenchido (lançamento já enviado ao eGestor).
- Validação de valor: numérico, maior que zero. Etiquetas editadas via campo de texto com tags separadas por vírgula, convertido em lista de strings (trim, remove vazios); a lista final não pode ficar vazia.
- Sem alteração da regra de negócio de que lançamentos sobem com as 2 tags padrão (conta + empreendimento, ver `lib/server/egestor.ts:523-531`) — a edição manual é um *override* pontual do operador para casos excepcionais, não uma mudança na geração automática.

## Camada 3 — Logs (tela nova)

**Objetivo:** dar visibilidade ao que já é rastreado no banco, sem inventar rastreamento novo.

- Nova rota `app/(app)/logs/page.tsx` + item de navegação na sidebar.
- Tela somente leitura combinando duas fontes já existentes:
  - `auditoria_correcoes`: campo alterado, valor anterior → novo, quem corrigiu, motivo, quando.
  - `notificacoes`: tipo de evento, título, corpo, quando.
- Sem paginação nova (consistente com o padrão do restante do sistema hoje — datasets pequenos, tudo em memória).
- Sem mudança de schema — é uma tela de leitura sobre dados que já existem.

## Camada 4 — Dashboard (Indicadores)

**Objetivo:** polimento visual da tela que o usuário está chamando de "dashboard".

- Aplicar os padrões da Camada 0 em `indicadores-view.tsx` e nas 4 sub-abas (`view-geral.tsx`, `view-receita.tsx`, `view-mapa.tsx`, `view-registro.tsx`).
- Revisar hierarquia visual dos cards de KPI (destaque do valor principal vs. label vs. subtexto) e contraste de cores nos indicadores positivo/negativo/neutro.
- Revisar microcopy dos estados "Aguardando dados".
- Sem mudança de dado, cálculo ou lógica de agregação — só apresentação.

## Camada 5 — Imóveis

**Objetivo:** polimento visual da tela de gerenciamento/histórico de imóveis, que já está funcionalmente completa.

- Aplicar os padrões da Camada 0 nas 4 abas (Imóveis, Imobiliárias, Empreendimentos, Regras Comerciais) e no drawer de histórico (`imovel-historico-drawer.tsx`).
- Revisar espaçamento das tabelas densas e consistência visual dos badges de status (alugado, inadimplente, vago, airbnb).
- Sem mudança de dado ou lógica de CRUD/sincronização — só apresentação.

## Fora de escopo

- RLS e permissões por papel/role no banco.
- Log de acesso/sessão de usuários (login/logout como evento de log) — mencionado como opção durante o brainstorming e descartado por ora.
- Convite de usuário por e-mail (depende de SMTP configurado no Supabase, não verificado).
- Qualquer mudança de dado, cálculo ou regra de negócio nas telas de Dashboard e Imóveis — é polimento de apresentação, não de lógica.
- Reestruturação da tela de Imóveis (abas, navegação, dados exibidos) — o usuário confirmou que a estrutura atual está correta.

## Riscos conhecidos

- **SMTP do Supabase não configurado** pode impedir fluxos que dependam de e-mail (convite de usuário) — por isso a Camada 2 usa senha temporária exibida na tela em vez de convite por e-mail.
- **Prazo muito curto**: se o tempo acabar antes de completar todas as camadas, a ordem definida (0→1→2→3→4→5) garante que o que foi entregue está completo; qualquer corte de escopo deve ser sinalizado explicitamente ao usuário, não feito silenciosamente.
