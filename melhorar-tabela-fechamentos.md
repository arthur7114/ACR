# Melhorar tabela de fechamentos

## Objetivo

Tornar a lista de fechamentos mais rápida de consultar, mantendo o contrato visual e operacional existente.

## Tarefas

- [x] Adicionar busca e filtros por status, competência, imobiliária e empreendimento → verificar combinações e estado vazio.
- [x] Ordenar todas as colunas de dados, com competência mais recente como padrão → verificar alternância crescente/decrescente e valores nulos.
- [x] Paginar em 25 itens e preservar consulta na URL → verificar retorno à tela e páginas sem resultados.
- [x] Cobrir a lógica de consulta com testes unitários → executar testes direcionados e suíte completa.
- [x] Validar UI, acessibilidade, tipos, lint, build e checklist → todos os comandos devem concluir sem bloqueadores.
- [x] Atualizar contrato e roadmap → registrar decisões, arquivos e próxima ação.

## Concluído quando

- [x] A equipe consegue localizar, ordenar e filtrar fechamentos sem perder a consulta ao navegar.
- [x] Estados de carregamento, lista vazia e busca sem resultado permanecem claros e acessíveis.

## Notas

- Sem mudança de schema ou regra financeira.
- A API continua retornando a coleção; filtros, ordenação e paginação são locais para manter a interação imediata.
