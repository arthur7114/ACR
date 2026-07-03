# Receita bruta e desconto/reembolso/TED como despesas do locador

**Status:** accepted (2026-07-02)

O resumo do fechamento exibe a receita **bruta** ("Recebidos locador"), mesmo
quando o documento da administradora imprime o valor já líquido de reembolsos;
descontos concedidos, reembolsos e tarifas bancárias (TED/PIX) são listados
como **despesas do locador** no resumo. A equação `receita bruta − comissão −
despesas = repasse` fecha centavo a centavo. Decisão do contador (Arthur) no
caso Pompilio Gomes maio/2026: bruto 14.128,65, despesas 124,63 (reembolso
113,27 + desconto 0,26 + TED 11,10), repasse 13.409,90.

## Considered Options

- **(A) Receita bruta + 3 despesas (escolhida).** As despesas ficam visíveis e
  a conta fecha; o header deixa de bater com o número impresso no PDF.
- **(B) Fiel ao documento.** Receita = valor impresso (líquido); só TED e
  desconto viram despesas; o reembolso ficaria escondido na linha do imóvel —
  rejeitada porque o contador quer as três despesas listadas no resumo.

## Consequences

- **Escopo global**: vale para todas as imobiliárias/layouts, não só para o
  layout consolidado (Cesar Rego). Semântica única de "despesa" entre
  fechamentos.
- **eGestor**: o lançamento de recebimento ("Recebimento mensal bruto") passa a
  usar esse bruto. Lançamentos já enviados não são alterados.
- **Inversão deliberada**: até esta data, `isNaoDespesaLocador` em
  `package-rechecks.ts` excluía ted/pix/desconto/reembolso das despesas —
  commits anteriores a 2026-07-02 refletem o modelo antigo; não é bug.
- **Base da comissão não muda**: a conferência "comissão calculada" continua
  sobre a receita líquida (é sobre ela que as administradoras cobram); só a
  receita exibida virou bruta.
- **Itemização com sobra explícita**: quando os itens identificados não somam o
  total retido, a diferença aparece como linha "Outros retidos (não itemizado)";
  diferença negativa suprime a lista e vira pendência — nunca se exibe item
  negativo inventado.
