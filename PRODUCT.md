# Product

## Register

product

## Users

Equipe interna da ACR Empreendimentos Imobiliários — quem faz a conferência e conciliação dos repasses todo mês. São operadores que já conhecem o domínio (fechamento, repasse, comissão, comprovante, competência) e trabalham no desktop, com pressa de fim de mês. O trabalho é recorrente e de alta responsabilidade: um número errado vira um repasse errado. Não são visitantes casuais nem executivos de passagem — são pessoas que abrem a mesma tela dezenas de vezes e precisam confiar no que veem.

## Product Purpose

Plataforma interna, single-tenant, para gestão e conciliação de prestações de contas imobiliárias. O usuário sobe o pacote mensal de documentos enviado pela imobiliária (mesmo em remessas parciais); o sistema extrai receitas, despesas, comprovantes e repasses, normaliza layouts diferentes em um modelo único, valida se tudo bate, aponta divergências e prepara os lançamentos para o eGestor. A IA auxilia a extração e classificação, mas **cálculo, validação e aprovação são determinísticos e humanos**. Sucesso = reduzir o tempo de conferência mensal, substituir a planilha manual por uma base estruturada e auditável, e não deixar passar erro, omissão, despesa sem comprovante ou repasse divergente.

## Brand Personality

Sóbria e confiável — tom de banco/contabilidade. Precisa, calma, sem ruído. A interface transmite confiança nos números antes de qualquer outra coisa; a estética serve a legibilidade e à auditabilidade, nunca compete com elas. Verde-marca ACR como âncora de identidade, usado com parcimônia. Voz direta e objetiva em português; sem jargão de marketing, sem entusiasmo forçado. Três palavras: **precisa, sóbria, confiável.**

## Anti-references

- **SaaS genérico.** Sem gradientes decorativos, grids de cards idênticos, hero-metric template (número gigante + label + gradiente), nem eyebrow em toda seção. O visual "startup 2023" mina a credibilidade de uma ferramenta financeira.
- **Planilha crua.** Não pode parecer um Excel/tabelão sem hierarquia, com tudo no mesmo peso. Os dados são densos, mas precisam de hierarquia: o que exige ação ou atenção salta; o resto recua.
- Corolário: nem enfeitada demais (SaaS), nem plana demais (planilha). O meio-termo é hierarquia sóbria.

## Design Principles

1. **Os números primeiro.** A interface existe para tornar valores financeiros confiáveis e escaneáveis. Nada decorativo compete com o dado. Alinhamento tabular, casas decimais consistentes, moeda formatada em pt-BR.
2. **Confiança por precisão.** A sobriedade sinaliza confiabilidade. Consistência de espaçamento, tipografia e cor é o que faz o usuário confiar no número. Qualquer descuido visual lê como descuido no cálculo.
3. **Hierarquia, não planilha.** Mesmos dados, pesos diferentes. Destaque o que precisa de ação (pendência, divergência, vacância); recue o que é contexto. Densidade com foco, não densidade uniforme.
4. **Determinístico à vista.** A IA extrai, mas o cálculo e a validação são determinísticos. A UI deixa explícito o que é dado confirmado vs. pendente de revisão — o estado de confiança é parte da informação.
5. **Verde ACR com significado.** A cor carrega estado (status, heatmap, positivo/negativo), não decoração. A marca aparece como âncora pontual, não como preenchimento.

## Accessibility & Inclusion

Sem exigência formal de conformidade WCAG — é ferramenta interna, base de usuários conhecida e de uso recorrente. Ainda assim, por bom senso: manter contraste legível nos números (o dado é o produto) e navegação por teclado funcional nos fluxos de conferência. Ponto de atenção conhecido e aceito: o heatmap usa a escala verde→amarelo→vermelho, que é ambígua para daltônicos; como não há requisito formal, convive-se com isso, mas rótulos/valores explícitos ao lado da cor são preferíveis quando o custo for baixo.
