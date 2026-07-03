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
