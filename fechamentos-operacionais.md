# Plano — Fechamentos operacionais

## Objetivo

Corrigir o fechamento sem alterar indicadores ou a integração com o eGestor: preservar o mês do recebimento, registrar a competência original de cada receita, tornar despesas e IPTU auditáveis e impedir aprovação enquanto houver referência ou imóvel sem resolução.

## Escopo de execução

1. Criar testes de regressão para João Cordeiro, Terreno Castelão, Pompílio Gomes e GM II.
2. Separar no modelo a competência original, o mês do recebimento e o dia de vencimento, mantendo compatibilidade com análises já salvas.
3. Persistir cada movimentação na competência original e bloquear receitas com competência ausente ou inválida.
4. Exibir o IPTU de passagem de Pompílio apenas na discriminação de receitas, sem alterar totais, despesas ou repasse.
5. Desdobrar despesas por categoria com descrição, referência e valor acessíveis por mouse, teclado e toque.
6. Exibir no GM II a taxa de 7%, a comissão dos aluguéis, a comissão de rescisão/acordo e o total.
7. Criar o fluxo lateral para resolver receitas sem imóvel vinculado, sem sobrescrever cadastro silenciosamente, e bloquear a aprovação enquanto restarem pendências.
8. Corrigir a cópia para “Extraído pela IA” e reparar os fechamentos afetados de forma determinística, com auditoria antes/depois.
9. Validar testes, tipos, lint, build, checklist do projeto e UX desktop/mobile/teclado; atualizar contratos e roadmap.

## Fora deste ciclo

- Alterações nas telas ou cálculos de indicadores.
- Mudanças de payload, consolidação ou regra do eGestor.
- Redesign do módulo autônomo de IPTU.

## Critério de conclusão

- Fechamentos de maio continuam totalizando o caixa recebido em maio.
- Receitas atrasadas gravam a competência original (por exemplo, março) por linha e por movimentação.
- `10` é tratado como dia de vencimento, nunca como competência.
- Aprovação é impossível com competência inválida/ausente ou receita sem imóvel vinculado.
- Pompílio, João Cordeiro, Terreno Castelão e GM II reproduzem os valores e referências acordados.
- Toda correção de dado existente deixa trilha de auditoria e não reexecuta IA.

## Estado do ciclo

- Concluído no código: itens 1 a 8, contratos e roadmap.
- Validado localmente: 207 testes, tipos, lint e checklist mestre 6/6.
- Pendente de ambiente integrado: aplicar a migration transacional, dry-run/commit do reparo real e QA autenticada desktop/mobile/teclado.
- Bloqueio ambiental conhecido: build sem acesso ao Google Fonts e sandbox sem conexão ao Supabase/porta local; nenhuma escrita remota foi feita.
