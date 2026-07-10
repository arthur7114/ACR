# Backfill do histórico de fechamentos — Plural e Cesar Rego

**Data:** 2026-07-08
**Tipo:** backfill pontual (script único), sem alteração no fluxo de upload do app.

## Objetivo

Subir para o Supabase real o histórico de prestações de contas de duas
administradoras, a partir de 9 PDFs, fatiando cada extrato consolidado por
empreendimento — 1 fechamento por empreendimento por mês.

Fonte (em `~/Downloads`):
- Plural: JANEIRO, FEVEREIRO, MARÇO, ABRIL, MAIO (2026)
- Cesar Rego: FEVEREIRO, MARÇO, ABRIL, MAIO (2026)

## Decisões de modelagem (aprovadas)

Cada PDF mensal é um extrato **consolidado** que mistura mais de um imóvel/
empreendimento. Como o modelo do app amarra `1 fechamento = 1 imobiliária + 1
empreendimento + 1 competência`, cada PDF é **particionado por empreendimento**.

Justificativa: as telas do app (indicadores, histórico do imóvel) fatiam por
empreendimento; os PDFs não trazem comprovante de repasse separado, então
dividir não quebra conciliação (cada linha já carrega seu total a repassar).

### Empreendimentos

| Empreendimento | Imobiliária | Situação no banco | Ação |
|---|---|---|---|
| Galpão José Walter | Plural Imobiliaria | existe, ativo (`bba97a49-…`) | reusar |
| Fernando Rocha | Plural Imobiliaria | não existe | **criar** |
| Galpão Pompilio Gomes | Cesar Rego Imoveis | existe, ativo (`28e2156a-…`) | reusar |
| João Cordeiro | Cesar Rego Imoveis | não existe | **criar** |

- "Fernando Rocha" = empreendimento do Apartamento José de Alencar (R. Ministro
  Abner de Vasconcelos 979, Apt. 1203), locador Fernando Rocha, administrado pela Plural.
- "João Cordeiro" = imóvel João Cordeiro 488 (apt A + B), administrado pela Cesar Rego.
- Todos os 4 empreendimentos-alvo estão **vazios** hoje (sem imóveis/fechamentos),
  então reusar os existentes não polui dados de outras imobiliárias.

IDs reais das imobiliárias:
- Plural Imobiliaria: `6b51bfec-9ab5-41cd-9a80-c82b51c198ea`
- Cesar Rego Imoveis: `9aa92df3-a760-4360-8747-5275e1551037`

### Mapa imóvel → empreendimento

Plural (por código de contrato):
- `AP0361` (Apartamento José de Alencar) → **Fernando Rocha**
- `GA0002` (Galpão Prefeito José Walter) → **Galpão José Walter**

Cesar Rego (por código do imóvel):
- `0002520`, `0002521` (João Cordeiro 488 apt A/B) → **João Cordeiro**
- `0002526`, `0002527` (Pompilio Gomes 230/240) → **Galpão Pompilio Gomes**

### Fechamentos resultantes (16)

| Empreendimento | Meses | Nº |
|---|---|---|
| Galpão José Walter (Plural) | jan, fev, mar, abr, mai | 5 |
| Fernando Rocha (Plural) | jan, fev, mar | 3 |
| João Cordeiro (Cesar Rego) | fev, mar, abr, mai | 4 |
| Galpão Pompilio Gomes (Cesar Rego) | fev, mar, abr, mai | 4 |

Competência derivada do mês no nome do arquivo (JANEIRO→2026-01 … MAIO→2026-05).

## Arquitetura do script

Script único em `scripts/` rodado com Node 22 (`--env-file=.env.local`) usando a
service-role key (contorna o middleware de auth; escreve direto no Supabase).
Reaproveita os módulos server do app; **não** altera nenhum fluxo de produção.

### Fluxo (por PDF)

1. **Extração determinística** (sem IA, pra ser reproduzível):
   - Cesar Rego → `parseCesarRegoPrestacao` (existente, `lib/server/cesar-rego-parser.ts`).
   - Plural → parser pequeno **local ao script** (o texto é limpo: blocos
     `Contrato <cod> - <desc>`, linhas de repasse, `Total para repasse`). Não
     entra no pipeline de produção.
2. **Particionamento**: agrupa `receitas_por_imovel` por empreendimento usando o
   mapa de código acima.
3. **Por (empreendimento, mês)**: monta um `PrestacaoAnalysis` com apenas as
   linhas daquele empreendimento e recalcula `resumo_financeiro`/`totais` a partir
   dessas linhas (soma de aluguel, comissão, total a repassar embutido).
4. **Validação**: `validatePackage(...)` (`lib/server/package-rechecks.ts`) gera
   parecer/rechecks/guardrails do subconjunto. `commercialRule` via
   `getCommercialRuleForValidation` (provavelmente ausente → parecer pode alertar,
   não bloquear — aceitável para backfill).
5. **Persistência**: `persistPackage(...)` (`lib/server/persist-package.ts`) com
   `fechamentoContext` = { id (pré-criado via upsert em `fechamentos`),
   imobiliariaId, imobiliariaNome, empreendimentoId, empreendimentoNome,
   competencia }. O PDF-fonte original é anexado a cada fechamento gerado dele
   (traçabilidade; o doc mostra todos os imóveis, mas o fechamento só usa as linhas
   do seu empreendimento).

### Idempotência

`persistPackage` faz upsert do fechamento por `(imobiliaria, empreendimento,
competencia)` e limpa movimentações/validações antes de reinserir. Reexecutar o
script atualiza em vez de duplicar. Empreendimentos novos são criados via
`findOrCreate` por nome normalizado (não duplica).

## Componentes tocados

- **Novo:** `scripts/backfill-historico.ts` — orquestração, parser Plural local,
  mapa de empreendimentos, particionamento, laço de persistência.
- **Reutilizados sem alteração:** `cesar-rego-parser`, `package-rechecks`
  (`validatePackage`), `persist-package`, `supabase`, `regras-comerciais`,
  `prestacao-types`.
- **Criação de dados:** 2 empreendimentos ("Fernando Rocha", "João Cordeiro") +
  16 fechamentos + movimentações + validações + upload dos 9 PDFs no bucket
  `fechamento-documentos`.

## Verificação

Após rodar:
1. `GET fechamentos` deve listar 16 linhas (5+3+4+4), competências corretas.
2. Conferir subtotais de 1 fechamento por empreendimento contra o PDF (aluguel,
   comissão, total a repassar).
3. Cada fechamento deve ter documento anexado e movimentações por imóvel.
4. Empreendimentos: "Fernando Rocha" e "João Cordeiro" criados e ativos.

## Fora de escopo

- Cadastro imóvel a imóvel (`imoveis`) — as linhas entram como `movimentacoes`.
- Auto-split de extratos consolidados no pipeline de produção (fica como próximo
  passo separado, caso desejado).
- Comprovantes de repasse / despesas / reajuste (não há nesses PDFs).

## Riscos

- **Parser Plural novo:** só validado nesses 5 PDFs; se um layout futuro divergir,
  não é coberto (é um backfill pontual, aceitável).
- **Regra comercial ausente** nos empreendimentos novos → parecer pode marcar
  ressalva/alerta. Não bloqueia o backfill; revisável na UI depois.
- **Escrita em produção:** cria registros reais. Mitigado pela idempotência e por
  os fechamentos estarem hoje zerados (rollback simples se necessário).
