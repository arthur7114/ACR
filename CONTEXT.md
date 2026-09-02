# CONTEXT — Linguagem ubíqua do domínio ACR

Glossário canônico dos termos de fechamento imobiliário. Somente vocabulário —
sem detalhes de implementação.

## Termos

### Recebidos em nome do locador (receita do resumo)
Total **bruto** devido ao locador na competência: aluguéis e encargos (garagem,
água, IPTU, seguro) **antes** de abatimentos concedidos (descontos, reembolsos).
Quando o documento imprime o valor já líquido de um reembolso, a plataforma
exibe o bruto reconstituído. O recebimento lançado no eGestor usa este mesmo
bruto — um único significado em todos os sistemas.
*Decidido em 2026-07-02 (caso Pompilio Gomes, maio/2026): 14.128,65 (bruto), não
14.015,38 (líquido impresso).*

### Despesa do locador
Todo valor retido do repasse **além** da comissão de administração. Inclui:
tarifas bancárias (TED/PIX), descontos concedidos a inquilinos e reembolsos
devolvidos a inquilinos. **Exclui**: comissão de administração e taxa de
intermediação (têm categorias próprias).
*Nota histórica: até 2026-07-02 o sistema classificava TED/desconto/reembolso
como "não-despesa"; a decisão do contador inverteu isso.*

### Rateio da TED (tarifa bancária)
Quando a prestação retém uma **TED/tarifa bancária itemizada** (linha própria no
resumo, não o resíduo "Taxas e outros retidos"), ela é **rateada igualmente**
entre os imóveis com receita no mês — uma despesa por imóvel nas movimentações.
A soma das fatias é igual ao valor retido: é redistribuição, não altera totais
nem o repasse consolidado. A TED continua sendo despesa do locador (ADR-0001).
No eGestor entra como **uma despesa agregada** (o eGestor é agregado, sem
lançamento por imóvel). TED só no resíduo (não itemizada) **não** é rateada.
*Decidido em 2026-07-24: base igual por imóvel, escopo só tarifa bancária.*

### Reembolso
Devolução feita a um inquilino (ex.: reembolso APT A, 113,27 em maio/2026).
No documento pode aparecer abatido do recebido bruto; no domínio é uma
**despesa do locador**.

### Desconto (concedido)
Abatimento dado a um inquilino sobre o aluguel. No domínio é uma **despesa do
locador**, ainda que o documento o mostre por linha de imóvel.

### Equação de reconciliação do repasse
`Receita bruta − Comissão de administração − Despesas do locador = Repasse`.
Deve fechar centavo a centavo com o repasse impresso no documento.

### Comissão de administração
Percentual da administradora, incidente sobre a receita **líquida** de
descontos/reembolsos (o que efetivamente entrou), não sobre a bruta. Nunca
entra em "despesas do locador".
*Decidido em 2026-07-02: a receita exibida é bruta, mas a base de conferência
da comissão permanece líquida.*

### Intermediação
Taxa sobre novo contrato (ex.: LOCMAIS). Categoria própria; não é despesa do
locador nem comissão de administração.

### Competência original da receita
Mês/ano a que o aluguel recebido pertence. Deve ser informado em `MM/AAAA` ou
`AAAA-MM`; nunca é inferido de uma referência de IPTU ou de um número isolado.
Um aluguel de março recebido no fechamento de maio permanece receita recebida
em maio, mas sua movimentação usa março como competência original.

### Competência de recebimento
Mês do fechamento em que o dinheiro entrou. Não substitui nem reclassifica a
competência original da receita.

### Dia de vencimento
Dia do mês, de 1 a 31. Um valor isolado como `10` é dia de vencimento, nunca
competência. Competência ausente aparece como “Não informada” e bloqueia a
aprovação até confirmação do operador.

### IPTU de passagem
IPTU cobrado do inquilino e repassado pelo mesmo valor. Pode aparecer na
discriminação de “Receitas” para explicar o recebido, mas se anula na conta do
locador e não altera receita total, despesa ou repasse.

### Imóvel vinculado
Receita cuja linha e movimentação apontam explicitamente para um cadastro de
imóvel ativo. Coincidência textual de código ou unidade é apenas sugestão; não
substitui o vínculo persistido.

### Unidade alugada (tela de Revisão)
Unidade que teve locatário na competência: pagante, inadimplente do mês, em
intermediação (primeiro mês) ou com rescisão proporcional dentro do mês.
Inadimplentes, intermediação, rescisões e reajustes são **subconjuntos** de
Alugadas, nunca baldes paralelos. Vagas e unidades por aplicativo ficam fora.
*Decidido em 2026-09-01 (GM II jul/26): 27 unidades − 3 vagas = 24 alugadas.*
Nos Indicadores, a ocupação descreve o fim do mês: a unidade rescindida encerra
a competência vaga (decisão de 2026-08-18, Grand Maracanaú 214). As duas telas
declaram a própria definição no texto.

### Aluguel recebido médio
Coluna Aluguel das unidades alugadas dividida pelo número de unidades alugadas
(inadimplente e intermediação entram com zero). A fórmula é impressa no tile
para o operador reproduzir na calculadora.

### Reajuste (atualização monetária)
Coluna REAJUSTE do documento Alive: mês do reajuste anual do contrato. Quando
coincide com a competência e a linha não é contrato novo (proporcional), a
unidade recebe a etiqueta **Reajuste**. Fonte única é o documento; o sistema
não infere reajuste comparando valores.
