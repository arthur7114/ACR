# Workflow: Execute Next

Usado para continuar a implementação a partir do roadmap.

## Passos

1. Ler `docs/12-execution-roadmap.md` — identificar o próximo slice não implementado
2. Ler `docs/02-mock-contract.md` — entender o contrato de UI/UX do slice
3. Ler `docs/06-acceptance-criteria.md` — carregar os critérios de aceite do slice
4. Classificar o request como COMPLEX
5. Planejar a implementação antes de codificar:
   - Quais arquivos serão criados ou modificados
   - Quais padrões existentes serão reutilizados
   - Se há mudança de schema → planejar migration
6. Implementar
7. Validar: `pnpm lint && pnpm build`
8. Atualizar `docs/12-execution-roadmap.md`:
   - Marcar slice como concluído
   - Registrar decisões tomadas
   - Listar arquivos impactados
   - Definir próxima ação
9. Atualizar qualquer doc numerado cujo contrato mudou
