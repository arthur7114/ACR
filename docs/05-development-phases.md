# 05 - Development Phases

## Etapa 0 - Governanca e contrato

Objetivo: deixar docs, roadmap, harness e mock acessiveis.

Entregaveis:

- trilha numerada em `docs/`;
- contrato do mock registrado;
- `AGENTS.md` e `.agent/rules/GEMINI.md` apontando para docs;
- mock versionado.

Criterios: docs navegaveis, roadmap com proxima etapa e paths existentes.

## Etapa 1 - App vivo sem IA

Objetivo: transformar o mock em app funcional com persistencia real basica.

Entregaveis:

- Supabase configurado;
- schema inicial para fechamentos, imobiliarias, empreendimentos, imoveis, documentos e perfis;
- Auth + RBAC inicial;
- CRUD de fechamentos com status real;
- upload para Supabase Storage com hash;
- classificacao manual de tipo de documento;
- cadastro/importacao CSV de imoveis;
- UI do mock conectada a dados reais.

Criterios: CA01, CA02, parte de CA03, CA09, CA12.

## Etapa 2 - Extracao basica ponta a ponta

Objetivo: processar o primeiro fechamento real Alive / GM II com dados extraidos.

Entregaveis:

- Edge Function de extracao;
- extracao do comprovante de repasse;
- Claude API para secao 1 da prestacao Alive;
- normalizacao das movimentacoes principais;
- validacao basica de repasse;
- revisao com dados reais;
- reprocessamento parcial minimo.

Criterios: CA03, CA04 parcial, CA05, CA07 parcial, CA08, CA13.

## Etapa 3 - Extracao completa e validacoes

Objetivo: fechar o caso Alive / GM II completo com validacoes e aprovacao.

Entregaveis:

- parser das 4 secoes Alive;
- extracao de despesas ENEL, CAGECE, IPTU e seguro;
- conciliacao de comprovantes;
- motor de divergencias e severidades;
- notificacoes in-app;
- aprovacao com RBAC completo;
- auditoria de correcoes e justificativas.

Criterios: CA04 completo, CA06, CA07, CA10, CA11, CA12, CA14.

## Etapa 4 - eGestor e layouts futuros

Objetivo: expandir apos o MVP validado.

Entregaveis:

- parser Cesar Rego;
- parser Plural;
- previa e envio eGestor;
- dashboard financeiro completo;
- logs de envio, retry e status.

Criterios: criterios especificos a definir antes da fase.

## Como atualizar este doc

Ao concluir uma etapa, marque o status em `12-execution-roadmap.md`, registre validacoes executadas e atualize esta pagina se a composicao das etapas mudar.

