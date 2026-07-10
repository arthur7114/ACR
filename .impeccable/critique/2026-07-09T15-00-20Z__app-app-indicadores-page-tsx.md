---
target: critique os indicadores
total_score: 29
p0_count: 2
p1_count: 2
timestamp: 2026-07-09T15-00-20Z
slug: app-app-indicadores-page-tsx
---
# Critique — Indicadores da carteira

Method: dual-agent (A: design review · B: detector + browser evidence). Live-verified at 1280 and 768; all sharp claims cross-checked against the real `/api/indicadores?competencia=2026-05-01` payload.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Header says "Consolidado de Maio/2026" implying completeness; nothing signals Maio is the sparsest/partial month. Double fetch on load. |
| 2 | Match System / Real World | 4 | Domain language is excellent; the `fonte:` provenance chips are a standout. |
| 3 | User Control and Freedom | 3 | Four filters, but no "limpar filtros", no result count, native selects only. |
| 4 | Consistency and Standards | 3 | `SectionHeader "Ocupação & vacância"` sits directly above the *Evolução do faturamento* chart — label doesn't match content. |
| 5 | Error Prevention | 2 | The default view invites a wrong read (cliff + subset ratio); columns that don't foot invite "the numbers are wrong". |
| 6 | Recognition Rather Than Recall | 3 | Heatmap requires recalling the 0–max% scale; today it's a wash of green zeros. |
| 7 | Flexibility and Efficiency | 2 | "Todos os imóveis" is a native select with 100+ unsorted options, no typeahead; Registro (260 rows) has no sort/pagination/export. |
| 8 | Aesthetic and Minimalist | 3 | Movimentações grid (5/8 tiles empty) and all-zero heatmap spend real estate on non-information. |
| 9 | Error Recovery | 3 | Real error + loading states exist (AlertTriangle, spinner). |
| 10 | Help and Documentation | 3 | Inline `CardNote` + `Pendencias` "aguardando dados" are genuinely good self-documentation. |
| **Total** | | **29/40** | **Good** — solid foundation; the weak areas are data-coherence and trust, not craft. |

## Anti-Patterns Verdict

**Does this look AI-generated? No.** It reads as a deliberately-built accountant tool: one green ramp with semantic meaning, sober cards, `tabular-nums` throughout, domain-fluent copy, and `fonte:` provenance chips on chart headers. A user fluent in Linear/Stripe/Notion would trust it on first glance.

**Deterministic scan (Assessment B): 0 findings, exit 0 (clean).** None of the absolute bans are present — no side-stripe borders, gradient text, glassmorphism, hero-metric template, numbered markers, or text overflow. No console errors; the only failed network request was the expected auth call during the temporary bypass.

**Two honest tells** (not bans, but they undercut "confiança por precisão"):
- `SectionHeader` (`section-header.tsx:4`) is a literal uppercase-tracked eyebrow — its own JSDoc calls it "eyebrow em maiúsculas" — used 5× per tab. In a dashboard a single restrained section label is defensible, but here it also *lies* (see P2 below).
- The 8-tile Movimentações grid reads as an identical-card grid amplified by empty data (5 of 8 tiles show 0 / — / R$ 0).

## Overall Impression

The craft is genuinely good — this is not a redesign case. The problem is **trust**, and it's concentrated in exactly the places a reconciliation tool cannot afford it. The single biggest opportunity: **make data completeness and denominators explicit.** Right now the default view presents a partial month as if it were the whole book, and several on-screen numbers don't foot. Fix the honesty of the numbers and this jumps from "good dashboard" to "tool an accountant trusts."

## What's Working

1. **Provenance chips (`fonte: …`) on every chart header** (`chart-card.tsx`). Rare and exactly right — every number states its origin (fechamentos vs cadastro vs regras comerciais). This is principle #4 ("determinístico à vista") done well.
2. **The `Pendencias` + hatched `pending` treatment** (`pendencias.tsx`, `metric-tile.tsx`). Explicitly separating "confirmed" from "not-yet-extracted", with one consistent diagonal-hatch visual language across tiles, cascata bars, and heat cells.
3. **The Receita waterfall's honest color semantics** — a zeroed offender renders neutral gray, not a fake red "−" (`cascata-waterfall.tsx`). Real care against visual lying.

## Priority Issues

### [P0] Subset numbers are presented as portfolio numbers
The cascata reports **85,7% realizado** anchored on `potencial` R$ 20.607,78 — but the payload also carries `potencialContratado` **R$ 67.339,69** (the full contracted book) that is **never rendered**. Meanwhile the header ("Consolidado de Maio/2026 · 113 imóveis") pairs occupancy from the full 113-property cadastro with financials drawn from a disjoint, much smaller set of consolidated statements.
- **Why it matters:** A conferente reading "85,7% realizado" can't see the base is ~30% of the contracted portfolio. Calculation-trust failure disguised as a healthy green number. Violates "confiança por precisão" + "determinístico à vista" at the core.
- **Fix:** Render the contracted denominator (a 4th cascata anchor, or "cobertura do mês: R$ 20,6k de R$ 67,3k contratado"). Make the header state coverage, not just a count. Bring the `fonte:` provenance discipline to the KPI row so cadastro-sourced vs statement-sourced KPIs are visually distinct.
- **Command:** `clarify` → `harden`.

### [P0] The faturamento series stages a misleading cliff — with the sparsest month emphasized
`serieMensal` = 68,5k / 79,1k / 80,3k / 18,7k / 17,7k. The last bar (Maio, partial) is filled solid `--acr-green` as the emphasized "current" value while full earlier months are muted `--acr-green-soft` (`faturamento-bar-chart.tsx:39`).
- **Why it matters:** The emphasis inverts reality — it spotlights the least-complete data point and stages an 80k→18k drop as a headline trend. Under deadline this reads as either "revenue collapsed" (false alarm) or "this is our number" (normalized-wrong).
- **Fix:** Badge partial competências (reuse the existing pending hatch + a "parcial" tag) and don't emphasize the latest bar when it's incomplete. Reconsider defaulting the whole dashboard to the newest month when it's structurally the least complete — default to the last fully-processed month.
- **Command:** `clarify` (pairs with the P0 above).

### [P1] Numbers that don't foot on screen
Two confirmed against the live payload:
- **Movimentações:** IPTU R$ 0 + Água R$ 0 + Seguro R$ 0, but "Despesa operacional" and the "Despesa total" KPI both show **R$ 1.347,47** (`despesaPorCategoria` is all-zero for consolidated-layout months; the total comes from a different column).
- **Registro:** apto 0002520 → Aluguel 1.213,27 − Desconto 113,27 should be 1.100,00, but **Total pago shows 1.213,27**; apto 0002521 → Total 882,64 *exceeds* Aluguel 788,22.
- **Why it matters:** In an accountant tool, 0+0+0 = R$1,3k and adjacent columns that don't reconcile are the single most trust-destroying thing on the page. The first instinct is "the numbers are wrong," which poisons the whole view.
- **Fix:** When category breakdown is unavailable (consolidated layouts), suppress the zero tiles and label the operational total with its own `fonte:` chip instead of "água + IPTU + seguro". In Registro, either show a column that actually foots (or a computed check), or make the Aluguel/Desconto/Total relationship explicit.
- **Command:** `harden`.

### [P1] Filtering and the register are hostile at real scale
"Todos os imóveis" is a native `<select>` with 100+ options (tenant names + bare unit numbers, unsorted: `10`, `101`, `102`), no search (`indicadores-view.tsx:102`). The Registro table renders 260 rows with a text filter but no column sort, no pagination/virtualization, no export.
- **Why it matters:** The core power-user move — drill to one unit / find one payment under deadline — means scrolling a 100-row OS dropdown or a 260-row table. Fails flexibility/efficiency hard (Alex).
- **Fix:** Replace the imóvel filter with a searchable combobox (shadcn Command/Popover), grouped by empreendimento, numerically sorted. Add sortable columns + export to Registro.
- **Command:** `optimize`.

### [P2] Small-text contrast dips below legibility in a numbers-first tool
`--acr-muted #6b7f6e` measures **~4.1:1** on the page background and is used for 10.5–13.5px sub-labels, `fonte:` chips (further reduced by `opacity-85`), and captions. In the heatmap, the **q4 band `#e8a15a` with white text ≈ 2.2:1** (the reddest q5 is fine — it already uses white at 5.14:1; q4 is the actual failure).
- **Why it matters:** No formal WCAG requirement here, but sub-4.5:1 on 10.5px body text is a real legibility cost when the number *is* the product, and the low-contrast cells are among the ones that most demand reading.
- **Fix:** Use `--acr-muted-2 #3d4f3f` (8.8:1) for small text; drop the `opacity-85` on `fonte:`; give the q4 heat band dark ink (like q3) instead of white.
- **Command:** `audit` → `polish`.

### [P2] Mislabeled section + orphaned KPI card below 1100px
"OCUPAÇÃO & VACÂNCIA" is rendered directly above the *Evolução do faturamento* chart (`view-geral.tsx:72`). Separately, the 5-KPI row uses a single `min-[1100px]:grid-cols-5` breakpoint: clean 5-across at ≥1100px viewport, but it drops straight to 2-up below that (verified: 2 cols at 1000px/768px), orphaning the 5th card as a lone 2+2+1 — no intermediate 3-up step.
- **Why it matters:** The label misdirects; the orphan breaks grid rhythm ("hierarquia, não planilha"), and the 1024–1099px band is common (laptops, split screen).
- **Fix:** Rename the header to match its content (e.g. "Faturamento & ocupação") or reorder. Give the KPI row a 5→3→2 responsive step (or promote one KPI to a wider tile so the row always divides evenly).
- **Command:** `layout`.

## Persona Red Flags

**Alex (power user, monthly reconciliation):** imóvel `<select>` with 100+ unsorted options, no search — blocks the core "drill to one unit" move. Registro: 260 rows, no sort/pagination/export. Double fetch on every visit (`/api/indicadores?` fires empty, then re-fires with the seeded `competencia`) — perceptible extra latency.

**Sam (accessibility):** `fonte:` chips and 10.5px captions at ~4.1:1 (lower with opacity); q4 heat cells white-on-orange at ~2.2:1. Heatmap encodes state green→amber→red with the digit as the only secondary channel (fine while values are 0, lost under real inadimplência for colorblind users — known/accepted tradeoff). Tab nav and segmented toggles are plain `<button>`s without `role="tab"`/`aria-selected`/`aria-pressed`.

**Conferente ACR (verifying a closing under time pressure):** the 0+0+0 = R$1,3k Movimentações mismatch and the non-footing Registro columns stop verification cold — first instinct is "the numbers are wrong." "85,7% realizado" on a base that hides the R$67,3k contracted potential means signing off on a healthy-looking ratio that isn't the portfolio's.

## Minor Observations

- Registro "Inquilino" column holds a full street address for GA0002 (galpão), wrapping ~6 lines and blowing out row height — column mislabeled or data mis-mapped.
- Sidebar doesn't collapse at 768; it holds ~28% width, squeezing content to 2-col KPIs and clipping the "Registro de pagamentos" tab with no scroll affordance.
- The all-zero heatmap: consider collapsing to "sem inadimplência registrada" until a cell crosses a threshold, reserving the grid for when it earns the space.
- Descontos offender in the waterfall (R$113 on a 20k scale) renders as a ~1px line with a floating label.

## Questions to Consider

- If the default competência is structurally the least-complete month, why is it the default? Should the landing view default to the last *fully-processed* month, with partial months explicitly badged?
- The `fonte:` chips promise provenance discipline — so why do the Geral KPI cards (the most-trusted numbers) omit them?
- You already have `potencialContratado` in the payload. What's the argument for computing the headline realization ratio against the statement subset instead of the contracted book — and if it's a deliberate "coverage" metric, is it labeled as one anywhere a user can see?
- Is a mostly-empty grid the right default object for the heatmap, or should it earn its space only once there's signal?
