# PRD — Módulo de Fechamento Imobiliário e Conciliação de Repasses

**Produto:** Plataforma interna de gestão e conciliação de repasses imobiliários
**Módulo:** Fechamento Imobiliário
**Versão:** 0.3
**Status:** Revisado — pronto para desenvolvimento
**Responsável pelo produto:** Arthur Brito
**Data:** 2026-05-15

**Changelog v0.3 (sobre v0.2):**
- Fluxo incremental de documentos: fechamento aceita novos docs após processamento
- Dois novos status: `documentos_adicionados` e `reprocessando_parcial`
- Regra explícita de merge de extrações sem perda de correções manuais
- Validação parcial liberada sem prestação (com alerta bloqueante específico)
- Plano de desenvolvimento em 4 fases com stack decidida

**Changelog v0.2 (sobre v0.1):**
- Decisão formal de single-tenant no MVP
- Modelagem de parcelas (IPTU, seguro) na entidade Movimentação
- Mapeamento das 4 seções reais da prestação Alive
- Novos tipos de movimentação (multa rescisão, acordo parcela, débito histórico)
- Definição formal de competência, tolerância de repasse e janela de conciliação
- RF21 notificações, RF22 cadastro imóveis, RF23 RBAC, RF24 configurações
- Resolução do conflito RF20 (dashboard removido do MVP 1)
- RBAC com tabela de permissões por papel
- Sprints com duração estimada
- 15 perguntas em aberto classificadas por urgência com owner

---

## 1. Visão geral

O módulo de **Fechamento Imobiliário** tem como objetivo automatizar a conferência mensal de prestações de contas enviadas por imobiliárias, centralizando em uma única interface:

- upload de documentos mensais (em uma ou mais remessas);
- leitura e extração de dados financeiros;
- normalização de layouts diferentes por imobiliária;
- conciliação entre prestação, comprovantes, despesas e repasses;
- identificação de divergências;
- revisão e aprovação humana;
- preparação dos lançamentos para envio ao eGestor.

O sistema não deve ser tratado apenas como um "leitor de planilhas". Ele deve operar como uma camada de **auditoria, conciliação e fechamento financeiro imobiliário** antes do lançamento no sistema financeiro oficial.

---

## 2. Contexto do problema

Atualmente, o fechamento mensal depende de uma revisão manual dos documentos enviados pelas imobiliárias. Esse processo envolve:

1. baixar documentos recebidos por e-mail;
2. abrir relatórios de prestação de contas;
3. conferir imóveis, aluguéis, taxas, descontos, inadimplências e despesas;
4. conferir comprovantes de pagamento;
5. validar se o valor repassado bate com a prestação;
6. alimentar manualmente uma planilha própria;
7. consultar dashboard/matriz mensal;
8. lançar manualmente no eGestor.

Esse processo é demorado, sujeito a erro humano e difícil de auditar posteriormente. O problema aumenta porque cada imobiliária usa formatos diferentes de prestação. Algumas entregam planilhas, outras PDFs, outras extratos consolidados, e algumas enviam comprovantes em formato de imagem ou PDF.

Na prática, os documentos de um mesmo fechamento frequentemente chegam em momentos diferentes — comprovante de repasse na sexta, prestação e despesas na segunda seguinte. O sistema precisa suportar esse fluxo sem forçar o usuário a criar múltiplos fechamentos para a mesma competência.

---

## 3. Job to be done

> Quando chegar o final do mês, quero subir no sistema o pacote de documentos enviado pela imobiliária — mesmo que chegue em partes —, para que o sistema extraia receitas, despesas, comprovantes e repasses, valide se tudo bate, aponte divergências e gere um fechamento aprovado para lançamento no eGestor.

---

## 4. Objetivos do produto

### 4.1 Objetivos principais

- Reduzir drasticamente o tempo de conferência mensal.
- Substituir a planilha manual de controle por um banco estruturado.
- Padronizar documentos de imobiliárias diferentes em um modelo único.
- Identificar erros ou omissões em prestações de contas.
- Conciliar despesas informadas com seus respectivos comprovantes.
- Validar se o valor transferido pela imobiliária bate com o valor líquido da prestação.
- Criar histórico auditável por competência, imóvel, imobiliária e documento.
- Preparar lançamentos organizados para o eGestor.
- Suportar o recebimento de documentos em múltiplas remessas para a mesma competência.

### 4.2 Objetivos secundários

- Criar base para dashboards financeiros por imóvel, imobiliária e competência.
- Permitir auditoria retroativa sem precisar revisar todos os documentos manualmente.
- Criar uma interface mais visual e amigável do que o controle atual no eGestor.
- Mapear categorias internas para tags/categorias usadas no eGestor.

---

## 5. Não objetivos nesta fase

Fora do escopo do MVP 1:

- Captura automática de e-mails.
- Uso de n8n como parte do fluxo principal.
- Integração imediata com todos os layouts de todas as imobiliárias.
- Lançamento automático no eGestor sem revisão humana.
- Substituição completa do eGestor.
- Dashboard financeiro completo (entra no MVP 4).
- App mobile.
- Conciliação bancária automática via extrato da conta.
- Gestão completa de contratos de locação.
- Importação do histórico da planilha de controle manual (avaliado em fase posterior).
- Multi-tenancy (avaliado apenas quando necessário para expansão).

---

## 6. Decisão de multi-tenancy

> **Decisão tomada em v0.2 — obrigatória antes da Sprint 1.**

O sistema é **single-tenant na fase inicial**: um único proprietário (ACR Empreendimentos Imobiliários Ltda, CNPJ 13.724.432/0001-97) com múltiplas imobiliárias, empreendimentos e imóveis.

Não é necessário `proprietario_id` nas entidades do MVP 1. A estrutura multi-tenant pode ser adicionada futuramente via tabela de proprietários e isolamento de dados por schema ou filtro de linha.

Quando multi-tenancy for necessário, as entidades **Fechamento**, **Imóvel**, **Empreendimento** e **Comprovante** precisarão de `proprietario_id`. Esta decisão deve ser revisada antes de qualquer expansão do sistema para outros clientes.

---

## 7. Decisão de arquitetura

### 7.1 Decisão

O fluxo principal deve ser desenvolvido **nativamente no sistema**, sem n8n no MVP.

### 7.2 Justificativa

O fluxo descrito é uma funcionalidade de produto, não uma automação operacional. Exige banco de dados, tela de revisão, estado de processamento, regras financeiras versionadas, histórico de auditoria, rastreabilidade de documentos, tratamento de erro, reprocessamento e logs de extração e validação. O n8n pode ser útil futuramente para capturar e-mails ou enviar alertas, mas não deve ser a camada principal de processamento.

### 7.3 Stack decidida

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js + Tailwind CSS + shadcn/ui |
| Backend / API | Next.js API Routes |
| Banco de dados | Supabase (PostgreSQL) |
| Auth + RBAC | Supabase Auth + RLS |
| Armazenamento de arquivos | Supabase Storage |
| Pipeline de extração (async) | Supabase Edge Functions |
| IA para leitura de documentos | Claude API (vision) |
| Realtime (status de processamento) | Supabase Realtime |
| Deploy | Vercel |

### 7.4 Arquitetura do pipeline

```
Frontend
    ↓
Next.js API Route
    ↓
Supabase Storage  ←── documentos originais (imutáveis)
    ↓
Edge Function (async)
    ↓
Claude API  ←── extração e classificação
    ↓
Normalização por parser/layout
    ↓
Motor de validação determinístico
    ↓
Supabase PostgreSQL  ←── fonte de verdade
    ↓
Supabase Realtime  ←── atualiza status na tela
    ↓
Tela de revisão
    ↓
Aprovação humana (RBAC)
    ↓
Payload eGestor
```

---

## 8. Usuários, personas e papéis (RBAC)

### 8.1 Gestor financeiro / proprietário — papel `aprovador`

Responsável por conferir se a imobiliária repassou corretamente e aprovar o fechamento.

Permissões:
- visualizar todos os fechamentos;
- aprovar fechamento sem divergência bloqueante;
- aprovar fechamento com divergência bloqueante justificada (override autorizado);
- ignorar alerta de qualquer severidade com justificativa;
- acessar histórico e auditoria completos.

### 8.2 Operador administrativo — papel `operador`

Responsável por subir arquivos, revisar pendências e preparar lançamentos.

Permissões:
- criar fechamento;
- subir documentos (primeira remessa e remessas adicionais);
- visualizar fechamentos;
- corrigir campos processados;
- marcar alerta não-bloqueante como resolvido;
- reprocessar documento;
- não pode aprovar fechamento.

### 8.3 Desenvolvedor / administrador técnico — papel `admin`

Permissões: todas, incluindo configuração de parsers, mapeamento eGestor e gerenciamento de usuários.

### 8.4 Somente leitura — papel `visualizador`

Permissões: visualizar fechamentos, documentos e relatórios. Nenhuma ação.

### 8.5 Tabela de permissões

| Ação | visualizador | operador | aprovador | admin |
|---|---|---|---|---|
| Visualizar fechamentos | ✓ | ✓ | ✓ | ✓ |
| Criar fechamento | — | ✓ | ✓ | ✓ |
| Subir documentos (1ª remessa) | — | ✓ | ✓ | ✓ |
| Adicionar documentos (remessa adicional) | — | ✓ | ✓ | ✓ |
| Corrigir campo extraído | — | ✓ | ✓ | ✓ |
| Resolver alerta não-bloqueante | — | ✓ | ✓ | ✓ |
| Aprovar fechamento | — | — | ✓ | ✓ |
| Override de bloqueante com justificativa | — | — | ✓ | ✓ |
| Configurar parser / regras | — | — | — | ✓ |
| Gerenciar usuários | — | — | — | ✓ |

---

## 9. Definições formais

### 9.1 Competência

**Competência = mês e ano de vencimento do contrato do locatário.**

Independentemente de quando o pagamento foi recebido, a competência é sempre o mês original de vencimento. O aluguel de fevereiro/2026 do Apto 03 (Francisco Santiago), pago em março com atualização por IGPM, juros e multa, pertence à competência `02/2026` — registrado no fechamento de `03/2026` como atrasado.

Campos obrigatórios para atrasados:
- `data_competencia` — mês/ano de vencimento original;
- `data_pagamento` — data real do recebimento;
- `tipo_movimentacao` — `receita_atrasado`.

### 9.2 Tolerância de divergência de repasse

| Diferença | Severidade |
|---|---|
| ≤ R$ 0,10 | baixa |
| > R$ 0,10 e ≤ R$ 5,00 | alta |
| > R$ 5,00 | bloqueante |

Limites configuráveis por imobiliária pelo papel `admin`.

### 9.3 Janela de conciliação de comprovantes

```
competência_inicio - 15 dias  ≤  data_pagamento  ≤  competência_fim + 45 dias
```

Exemplos reais (competência 03/2026): ENEL pago em 02/03 ✓ · CAGECE pago em 16/03 ✓ · Seguros pagos em 30/03 ✓ · IPTU pago em 02/03 ✓.

Fora da janela: alerta de severidade `média`. Configurável por categoria de despesa.

### 9.4 Processamento parcial sem prestação de contas

Se o usuário subir apenas o comprovante de repasse (sem a prestação), o sistema:
- extrai e salva os dados do comprovante normalmente;
- gera alerta bloqueante: *"Prestação de contas não encontrada. Não é possível validar se o valor do repasse está correto."*;
- mantém o fechamento em `processado_com_alertas`;
- bloqueia aprovação até que a prestação seja adicionada e processada.

---

## 10. Fluxo de documentos incrementais

### 10.1 Problema

Documentos de um mesmo fechamento frequentemente chegam em momentos diferentes. O comprovante de repasse pode chegar na sexta; a prestação e as despesas, na segunda. O usuário não deve ser obrigado a criar dois fechamentos para a mesma competência.

### 10.2 Regra

O fechamento aceita novos documentos em **qualquer status**, exceto `aprovado` e `lancado_egestor`.

### 10.3 Comportamento quando novos documentos são adicionados

1. Status do fechamento muda para `documentos_adicionados`.
2. O usuário vê a lista de documentos existentes + os novos.
3. O sistema classifica automaticamente os novos documentos.
4. Ao clicar em "Processar documentos adicionados", o status muda para `reprocessando_parcial`.
5. O pipeline processa **somente os documentos novos**.
6. As extrações novas são integradas (merge) com as existentes — sem sobrescrever o que já foi extraído e validado.
7. Correções manuais feitas anteriormente são **preservadas**.
8. As validações são executadas novamente sobre o conjunto completo.
9. O status final é `processado_com_sucesso` ou `processado_com_alertas`.

### 10.4 Interface

- Na tela de revisão (fechamento já processado), o botão passa a ser **"Adicionar documentos"** ao invés de "Reprocessar".
- Após o upload dos novos arquivos, aparece botão **"Processar documentos adicionados"**.
- Durante o reprocessamento parcial, a tela mostra quais documentos estão sendo processados (os novos) e quais já estão prontos (os anteriores).

### 10.5 Novos status adicionados à máquina de estados

```
documentos_adicionados    → usuário subiu docs novos após um processamento anterior
reprocessando_parcial     → pipeline processando apenas os documentos novos
```

### 10.6 Máquina de estados completa

```
rascunho
    ↓ upload de documentos
arquivos_enviados
    ↓ iniciar processamento
processando
    ↓ concluído
processado_com_sucesso | processado_com_alertas
    ↓ automaticamente
pendente_revisao
    ↓ usuário adiciona mais docs
documentos_adicionados
    ↓ processar adicionais
reprocessando_parcial
    ↓ concluído
processado_com_sucesso | processado_com_alertas
    ↓ aprovação
aprovado
    ↓
preparado_egestor
    ↓
lancado_egestor

A qualquer momento: → erro | cancelado
```

---

## 11. Entidades principais

### 11.1 Fechamento

```
id
imobiliaria_id
empreendimento_id
competencia                        -- formato YYYY-MM
status                             -- ver máquina de estados na seção 10.6
observacoes
total_receitas
total_despesas
total_comissoes
total_repassar
valor_repassado_comprovante
diferenca_total
tolerancia_divergencia_repasse     -- valor configurado (default R$ 0,10)
aprovado_por
aprovado_em
criado_por
criado_em
atualizado_em

UNIQUE (imobiliaria_id, empreendimento_id, competencia)
```

---

### 11.2 Documento do fechamento

```
id
fechamento_id
tipo_documento
nome_arquivo
arquivo_url                        -- path no Supabase Storage
mime_type
tamanho_bytes
hash_arquivo                       -- sha256, detecta duplicidade
status_processamento               -- aguardando | processando | processado | erro | ignorado
confianca_classificacao            -- 0.000 a 1.000
parser_versao
erro_processamento
classificado_manualmente           -- bool
remessa_numero                     -- 1 = primeira remessa, 2 = segunda, etc.
criado_em
```

**Tipos de documento:**
```
prestacao_contas
comprovante_repasse
relatorio_locacao_reajuste
despesas_comprovantes
extrato_imobiliaria
boleto
comprovante_pagamento
outro
```

---

### 11.3 Imobiliária

```
id
nome
cnpj
email
layout                             -- alive | cesar_rego | plural | outro
ativo
tolerancia_repasse_reais           -- sobrescreve padrão do sistema
janela_antes_dias                  -- default 15
janela_depois_dias                 -- default 45
criado_em
```

---

### 11.4 Empreendimento

```
id
nome
descricao
ativo
```

Exemplos: Grand Messejana II · Apartamento José de Alencar · Galpão Prefeito José Walter

---

### 11.5 Imóvel

```
id
empreendimento_id
imobiliaria_id
unidade                            -- ex: "Apto 01", "Sala 01"
inquilino_nome
status                             -- ocupado | vago | inadimplente | em_rescisao | em_negociacao | inativo
valor_aluguel_esperado
taxa_administracao_percent         -- ex: 7.0
ativo
criado_em
atualizado_em
```

> O cadastro de imóveis deve ser criado antes do processamento do primeiro fechamento. Sem cadastro, as validações de imóvel ausente e status incompatível não funcionam.

---

### 11.6 Movimentação

Tabela canônica de receitas, despesas, comissões, descontos e repasses.

```
id
fechamento_id
documento_id
imovel_id
tipo_movimentacao
categoria
descricao
valor
sinal                              -- positivo | negativo
data_competencia                   -- mês/ano de vencimento original
data_vencimento
data_pagamento                     -- data real do recebimento/pagamento
parcela_numero                     -- ex: 3 (IPTU 3/12)
parcela_total                      -- ex: 12 (IPTU 3/12)
parcela_referencia                 -- ex: "IPTU 2026", "Seguro Porto Seguro"
origem_documental
confianca_extracao                 -- 0.000 a 1.000
status_validacao
corrigido_manualmente              -- bool
parser_versao
criado_em
```

**Tipos de movimentação:**
```
receita_aluguel
receita_garagem
receita_agua
receita_iptu
receita_seguro
receita_atrasado
receita_juros_multa
receita_multa_rescisao             -- multa por rescisão antes do prazo
receita_acordo_parcela             -- parcela de acordo de rescisão
receita_debito_historico           -- débitos de competências antigas
desconto_aluguel
despesa_agua
despesa_energia
despesa_iptu
despesa_seguro
despesa_manutencao
comissao_administracao
comissao_intermediacao             -- 60% sobre intermediação de mês anterior
reembolso_inquilino
repasse
outro_credito
outro_debito
```

---

### 11.7 Comprovante

```
id
fechamento_id
documento_id
tipo_comprovante                   -- comprovante_repasse | comprovante_pagamento_boleto | comprovante_pix | comprovante_ted_doc
valor
data_pagamento
pagador
beneficiario
descricao
banco_origem
banco_destino
codigo_barras
protocolo
autenticacao
status_conciliacao
confianca_extracao
janela_conciliacao_valida          -- bool calculado na validação
criado_em
```

---

### 11.8 Validação

```
id
fechamento_id
documento_id
movimentacao_id
comprovante_id
tipo_validacao
severidade                         -- info | baixa | media | alta | bloqueante
status                             -- aberta | resolvida | ignorada_com_justificativa | bloqueante
mensagem
valor_esperado
valor_encontrado
diferenca
resolvido_por
resolvido_em
justificativa
criado_em
```

---

### 11.9 Mapeamento para eGestor

```
id
tipo_movimentacao
categoria_interna
imobiliaria_id
empreendimento_id
egestor_categoria_id
egestor_tag_ids
egestor_conta_id
descricao_padrao
ativo
```

---

## 12. Estrutura da prestação Alive / GM II — 4 seções

> Crítico para o parser do MVP 1. A prestação real tem quatro seções com lógica de extração completamente diferente.

### Seção 1 — Vigência do mês (tabela principal por apartamento)

Colunas: nome · apto · reajuste · aluguel · desconto · aluguel com desconto · garagem · água · IPTU · seguro incêndio · total · comissão · repasse · observação · vencimento · carência

Lógica:
- cada linha = um imóvel na competência atual;
- imóvel com valor zero em todas as colunas = inadimplência (verificar observação);
- IPTU aparece como parcela (ex: "3/12") — extrair `parcela_numero` e `parcela_total`;
- seguro "QUITADO" = zero na coluna (sem cobrança nova); seguro com valor = nova parcela (ex: "1/1");
- garagem para carro ≥ R$ 50,00; para moto ≤ R$ 30,00.

### Seção 2 — Intermediações de mês anterior

Mesmas colunas da seção 1.

Lógica:
- aluguel atrasado atualizado por IGPM (valores maiores que os originais);
- comissão inclui 60% de intermediação sobre o total;
- registrar `data_competencia` como o mês original, não o mês atual;
- tipo = `receita_atrasado` para o aluguel; `comissao_intermediacao` para a comissão diferenciada.

### Seção 3 — Acordos e rescisões recebidos no mês

Colunas: nome · apto · reajuste · principal · total · observação · vencimento · carência

Lógica:
- multas por rescisão antes do prazo → tipo `receita_multa_rescisao`;
- parcelas de acordos → tipo `receita_acordo_parcela` com `parcela_numero` e `parcela_total`;
- débitos históricos → tipo `receita_debito_historico` com `data_competencia` original registrada na observação;
- a observação contém a fórmula do cálculo (ex: "R$ 1.972,00 - R$ 453,77 (VIG JAN/26) = R$ 1.518,23") — extrair e armazenar.

### Seção 4 — Inadimplências ativas

Lista de devedores com status atual. Não gera movimentação nova (não houve recebimento), mas deve:
- atualizar status do imóvel para `inadimplente`;
- gerar alerta de severidade `alta` para cada inadimplente;
- registrar histórico para acompanhamento.

---

## 13. Tipos de documentos identificados nos exemplos reais

### 13.1 Comprovante de repasse — Alive / Banco Inter

Campos a extrair: valor transferido · data da solicitação · pagador (nome, banco, agência, conta) · recebedor (nome, CNPJ, banco, agência, conta, tipo) · protocolo de transação.

### 13.2 Relatório de locação/reajuste — Alive

Campos a extrair: apto afetado · índice aplicado (IPCA/IGPM) · período da correção · valor original · fator de correção · valor corrigido · para atrasados: juros, multa, subtotal e valor total.

### 13.3 Despesas e comprovantes — Alive / GM II

Documentos identificados nos exemplos reais:
- ENEL (conta de energia + comprovante Inter);
- CAGECE (conta de água + comprovante Inter);
- IPTU Fortaleza (DAM parcela 3/5 + comprovante Inter);
- Porto Seguro (boleto seguro Apto 04 + boleto seguro Apto 07 + comprovantes Inter).

Para cada despesa extrair: beneficiário · valor · vencimento · código de barras · data de pagamento · autenticação.

### 13.4 Extrato Cesar Rego (MVP 2)

Ledger contábil com colunas débito/crédito/saldo. O parser deve inverter sinais: crédito = receita, débito = despesa/comissão. Requer lógica de saldo acumulado. Complexidade maior que a Alive — épico separado.

### 13.5 Extrato Plural (MVP 2)

Estrutura simplificada por contrato: aluguel · fundo de reserva · taxa de administração · total.

---

## 14. Fluxo principal do usuário

### 14.1 Criar fechamento

```
Fechamentos → Novo fechamento
```

Campos obrigatórios: imobiliária · empreendimento · competência (mês/ano).
Campos opcionais: observações.

### 14.2 Subir documentos (1ª remessa)

Upload múltiplo. Tipos aceitos: PDF · XLSX · CSV · PNG · JPG · JPEG · WEBP.

### 14.3 Classificação automática

Após upload, o sistema tenta classificar cada documento. Confiança < 0,70 → usuário classifica manualmente.

```json
{
  "arquivo": "2. REPASSE MARÇO 2026 GM II.pdf",
  "tipo_documento": "comprovante_repasse",
  "confianca": 0.97
}
```

### 14.4 Processamento (1ª vez)

1. Salvar arquivos originais (imutáveis, com hash);
2. Extrair texto/tabelas/imagens via Claude API;
3. Identificar layout e imobiliária;
4. Aplicar parser específico (versão registrada);
5. Normalizar campos e seções (Alive: 4 seções);
6. Salvar movimentações com parcelas;
7. Extrair comprovantes;
8. Executar validações determinísticas;
9. Calcular diferença de repasse;
10. Atualizar status;
11. Notificar usuário (RF21).

Timeout por documento: 5 minutos. Após timeout: status `erro`, reprocessamento disponível.

### 14.5 Adicionar documentos (remessas adicionais)

Disponível enquanto o fechamento não estiver `aprovado` ou `lancado_egestor`.

1. Usuário clica em "Adicionar documentos" na tela de revisão;
2. Sobe os novos arquivos;
3. Sistema classifica automaticamente;
4. Usuário clica em "Processar documentos adicionados";
5. Status → `reprocessando_parcial`;
6. Pipeline processa somente os documentos novos;
7. Extrações novas são integradas ao conjunto existente (merge);
8. Correções manuais anteriores são preservadas;
9. Validações são executadas sobre o conjunto completo;
10. Usuário é notificado ao concluir.

### 14.6 Revisão

Após processamento, o usuário vê:
- Resumo financeiro;
- Receitas por imóvel;
- Despesas e comprovantes;
- Comprovante de repasse;
- Divergências;
- Documentos anexados (todas as remessas);
- Histórico.

A tela destaca: valores que bateram · valores divergentes · documentos sem correspondência · movimentações sem comprovante · imóveis ausentes ou com status incompatível · alertas de baixa confiança da IA · documentos aguardando processamento.

### 14.7 Correção manual

O usuário pode: editar categoria · editar imóvel relacionado · corrigir valor · corrigir data · corrigir parcela (número e total) · marcar alerta como resolvido · ignorar alerta com justificativa (somente `aprovador` e `admin` para bloqueantes) · reprocessar documento individual · subir documento complementar.

Toda correção gera log de auditoria: usuário · campo · valor anterior · valor novo · data/hora · justificativa.

### 14.8 Aprovação

Papel `aprovador` ou `admin` pode aprovar quando:
- não houver divergência bloqueante sem resolução ou justificativa autorizada;
- o comprovante de repasse estiver conciliado ou justificado;
- as despesas críticas estiverem conciliadas ou justificadas.

Após aprovação: `status = aprovado` · log de auditoria registrado.

### 14.9 Preparação para eGestor

Após aprovação, o sistema gera prévia dos lançamentos. Integração real implementada no MVP 3.

---

## 15. Regras de negócio e validações

### 15.1 Validação do valor de repasse

```
diferenca = |total_repassar_prestacao - valor_comprovante|

≤ R$ 0,10    → severidade baixa
> R$ 0,10 e ≤ R$ 5,00  → severidade alta
> R$ 5,00    → severidade bloqueante
```

Limites configuráveis por imobiliária.

### 15.2 Validação de fórmula da prestação

```
total_bruto - comissoes - despesas + outros_creditos - outros_debitos = total_liquido_repassar
```

Tolerância de verificação: R$ 0,02 (arredondamento de centavos).

### 15.3 Validação por imóvel

Para cada imóvel ativo cadastrado:
```
verificar se apareceu na prestação
verificar se teve aluguel, inadimplência ou justificativa
verificar se valores principais são coerentes com o esperado (±20%)
```

Alertas:
```
imovel_ativo_ausente           → alta
imovel_ocupado_sem_receita     → alta
imovel_vago_com_receita        → media
inadimplencia_sem_observacao   → media
valor_muito_diferente_esperado → media
```

### 15.4 Validação de comissão

```
comissao_calculada = base_de_comissao × percentual_contratado
```

Percentual padrão GM II / Alive: 7% sobre aluguel. Intermediação: 60% adicional. Tolerância: R$ 0,05.

### 15.5 Validação de despesas

Para cada despesa informada:
- deve existir documento de origem ou comprovante correspondente;
- valor informado deve bater com valor pago (tolerância R$ 0,02);
- beneficiário deve ser compatível com a categoria;
- data de pagamento deve estar dentro da janela de conciliação;
- parcela deve ser coerente com o histórico do imóvel quando disponível.

### 15.6 Validação de comprovantes

Para cada comprovante:
- deve haver movimentação correspondente;
- valor deve bater (tolerância R$ 0,02);
- data deve estar dentro da janela de conciliação;
- pagador deve ser compatível com a imobiliária;
- beneficiário deve ser compatível com o fornecedor/categoria.

### 15.7 Validação de boleto + pagamento

```
codigo_barras_boleto = codigo_barras_comprovante (quando disponível)
valor_boleto ≈ valor_pago (tolerância R$ 0,02)
beneficiario_boleto ≈ beneficiario_comprovante
```

Se não for possível comparar código de barras, conciliar por valor + beneficiário + data.

### 15.8 Validação de reajustes

```
valor_reajustado_do_relatorio deve aparecer na prestação
competência original deve estar registrada
índice e fator aplicados devem ser armazenados
```

### 15.9 Validação de parcelas

```
parcela_numero deve ser coerente com histórico (após 2/12, esperar 3/12)
parcela_total deve ser consistente entre meses
seguro "QUITADO" = zero na coluna, sem cobrança nova
seguro com parcela = nova cobrança registrada
```

### 15.10 Validação de duplicidade

O sistema impede duplicidade por combinação de:
```
imobiliaria_id + empreendimento_id + competencia + arquivo_hash
valor + data + codigo_barras (quando disponível)
autenticacao (quando disponível)
```

### 15.11 Validação sem prestação de contas

Quando o fechamento contém apenas comprovante de repasse (sem prestação):
```
Alerta bloqueante: "Prestação de contas não encontrada.
Não é possível validar se o valor do repasse está correto."
```

Aprovação bloqueada. Usuário deve adicionar a prestação via "Adicionar documentos".

---

## 16. IA e extração documental

### 16.1 Papel da IA

A IA atua como camada de leitura e interpretação:
```
PDFs com layout variável
comprovantes em imagem
boletos escaneados
tabelas difíceis
classificação documental
sugestão de mapeamento de campos
```

### 16.2 O que a IA não deve fazer sozinha

```
calcular valores finais sem validação por código
aprovar fechamento
lançar no eGestor sem revisão
substituir regras financeiras determinísticas
```

### 16.3 Saída estruturada obrigatória

Toda extração por IA deve retornar JSON validável.

```json
{
  "tipo_documento": "comprovante_pagamento",
  "valor": 1827.90,
  "data_pagamento": "2026-03-16",
  "pagador": "ALIVE IMOVEIS LTDA",
  "beneficiario": "CAGECE",
  "descricao": "CAGECE",
  "codigo_barras": "82640000018-6 27900009000-1 00315665601-3 02006231035-2",
  "autenticacao": "34802322103871038710394000018279033",
  "confianca": 0.96
}
```

### 16.4 Controle de confiança

```
>= 0,90  → aceitar automaticamente, sujeito às validações
0,70–0,89 → aceitar com alerta severidade baixa
< 0,70   → status pendente_revisao_humana, bloquear aprovação do campo
```

---

## 17. Requisitos funcionais

| ID | Requisito | MVP |
|---|---|---|
| RF01 | Criar fechamento com imobiliária, empreendimento e competência | 1 |
| RF02 | Upload múltiplo de documentos (PDF, XLSX, CSV, PNG, JPG) | 1 |
| RF03 | Armazenar arquivo original imutável com hash | 1 |
| RF04 | Classificar documentos automaticamente | 1 |
| RF05 | Permitir classificação manual quando automática falhar | 1 |
| RF06 | Processar prestação Alive (4 seções: vigência, intermediações, rescisões, inadimplência) | 1 |
| RF07 | Processar comprovante de repasse | 1 |
| RF08 | Processar despesas (ENEL, CAGECE, IPTU, seguro) | 1 |
| RF09 | Processar comprovantes de pagamento | 1 |
| RF10 | Normalizar movimentações em estrutura canônica com parcelas | 1 |
| RF11 | Conciliar despesas com comprovantes | 1 |
| RF12 | Conciliar repasse com comprovante bancário | 1 |
| RF13 | Gerar divergências com severidade | 1 |
| RF14 | Tela de revisão com resumo, receitas, despesas, comprovantes e divergências | 1 |
| RF15 | Correção manual com log de auditoria | 1 |
| RF16 | Reprocessar documento individual ou fechamento inteiro | 1 |
| RF17 | Aprovar fechamento (somente papel aprovador ou admin) | 1 |
| RF18 | Gerar prévia para eGestor | 1 |
| RF19 | Histórico e auditoria completos | 1 |
| RF20 | Dashboard básico | **4** |
| RF21 | Notificação in-app ao concluir processamento ou gerar divergência bloqueante | 1 |
| RF22 | Cadastro e importação CSV de imóveis por empreendimento | 1 |
| RF23 | Gestão de papéis e permissões (RBAC) | 1 |
| RF24 | Configuração de tolerâncias e janelas por imobiliária | 1 |
| RF25 | Adicionar documentos a fechamento já processado (remessa adicional) | 1 |
| RF26 | Reprocessamento parcial de documentos novos com merge das extrações existentes | 1 |

---

## 18. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF01 | Toda movimentação aponta para documento de origem, página, campo, data e método de extração |
| RNF02 | Arquivos protegidos por autenticação e RBAC (Supabase RLS) |
| RNF03 | Toda alteração manual registra usuário, campo, valor anterior/novo, data/hora e justificativa |
| RNF04 | Timeout de processamento: 5 minutos por documento; arquivos grandes usam job assíncrono (Edge Function) |
| RNF05 | Falhas de extração não corrompem o fechamento; reprocessamento sempre disponível |
| RNF06 | Novos layouts adicionáveis sem reescrever o módulo |
| RNF07 | Todo resultado extraído armazena a versão do parser e da regra utilizada |
| RNF08 | Reprocessamento parcial preserva correções manuais anteriores |
| RNF09 | Status de processamento atualizado em tempo real via Supabase Realtime |

---

## 19. Telas principais

### 19.1 Lista de fechamentos

Colunas: competência · imobiliária · empreendimento · status · total a repassar · valor comprovado · diferença · data de criação · ações.

Filtros: competência · imobiliária · empreendimento · status · com divergência.

### 19.2 Novo fechamento

Campos: imobiliária · empreendimento · competência · upload de arquivos.

Ações: salvar rascunho · processar fechamento · cancelar.

### 19.3 Processamento (estados visuais)

```
enviando arquivos
classificando documentos
extraindo dados
validando valores
conciliando comprovantes
finalizando
```

Para reprocessamento parcial, exibir quais documentos estão sendo processados e quais já estão concluídos.

### 19.4 Revisão do fechamento

Seções: resumo financeiro · receitas por imóvel · despesas e comprovantes · comprovante de repasse · divergências · documentos anexados (todas as remessas) · histórico.

Ação de adição: botão "Adicionar documentos" sempre visível enquanto o fechamento não estiver aprovado.

### 19.5 Prévia eGestor

Seções: lançamentos a criar · categorias internas → categorias eGestor · tags · contas · descrições · valores · status de validação.

---

## 20. Integração com eGestor

### 20.1 Princípio

O sistema próprio tem estrutura interna organizada, independentemente das limitações do eGestor.

### 20.2 Mapeamento

```
categoria interna → categoria eGestor
imóvel           → tag eGestor
imobiliária      → tag eGestor
empreendimento   → tag eGestor
tipo lançamento  → tipo eGestor
```

### 20.3 Estratégia por MVP

- MVP 1–2: gerar payload interno; sem envio real.
- MVP 3: autenticação · envio · log · retry · status de envio.

---

## 21. Plano de desenvolvimento

### Fase 1 — Plataforma viva sem IA (~2 semanas)

Objetivo: app funcional com dados reais persistidos. Consegue demonstrar para o cliente.

```
Supabase: projeto, schema, Auth + perfis (4 papéis)
CRUD de fechamentos com status real
Upload de documentos → Supabase Storage
Classificação manual de tipo de documento
Cadastro de imóveis por empreendimento
Botão "Adicionar documentos" na tela de revisão
Interface V0 conectada a dados reais
```

### Fase 2 — Extração básica (~2 semanas)

Objetivo: primeiro fechamento real processado ponta a ponta.

```
Edge Function: extração do comprovante de repasse (PDF texto limpo)
Claude API: extração da seção 1 da prestação Alive (tabela por apartamento)
Validação básica: comprovante de repasse bate com total da prestação?
Tela de revisão com dados reais extraídos
Reprocessamento parcial (merge de extrações)
```

### Fase 3 — Extração completa + validações (~3 semanas)

Objetivo: fechamento Alive completo, validações e aprovação.

```
Seções 2, 3 e 4 da prestação Alive (atrasados, rescisões, inadimplência)
Extração de despesas: ENEL, CAGECE, IPTU, Porto Seguro
Motor de validação com divergências e severidades
Notificações in-app (RF21)
Aprovação com RBAC completo
```

### Fase 4 — Outros layouts + eGestor (futuro)

```
Parser Cesar Rego (ledger contábil)
Parser Plural (extrato simplificado)
Integração API eGestor
Dashboard financeiro completo
```

---

## 22. Critérios de aceite

### CA01 — Fechamento criado
Dado imobiliária, empreendimento e competência, o sistema cria um fechamento em `rascunho`.

### CA02 — Upload realizado
Dado que o usuário sobe arquivos, o sistema armazena, gera hash e vincula ao fechamento com `remessa_numero = 1`.

### CA03 — Documentos classificados
Dado um pacote Alive / GM II, o sistema identifica: prestação principal · comprovante de repasse · relatório de reajuste · despesas/comprovantes.

### CA04 — Prestação processada (4 seções)
Dado a prestação GM II, o sistema extrai: linhas por apartamento (seção 1) · intermediações com tipos corretos (seção 2) · acordos e rescisões (seção 3) · inadimplências ativas (seção 4).

### CA05 — Comprovante de repasse processado
Dado o comprovante bancário, o sistema extrai: valor · data · pagador · recebedor · protocolo.

### CA06 — Despesas processadas
Dado o pacote de despesas Alive, o sistema extrai: ENEL · CAGECE · IPTU (com parcela) · seguros (com parcela) · comprovantes de pagamento.

### CA07 — Conciliação realizada
Dado uma despesa e comprovante correspondente, o sistema marca como `OK` quando valor, beneficiário e janela de data forem compatíveis.

### CA08 — Divergência de repasse gerada
Dado que o valor do comprovante não bate além da tolerância, o sistema gera alerta com severidade correta.

### CA09 — Revisão disponível
Dado que o processamento terminou, o usuário visualiza resumo, receitas, despesas, comprovantes e divergências.

### CA10 — Aprovação controlada
Dado que existem divergências bloqueantes não justificadas, o sistema não permite aprovação.

### CA11 — Notificação enviada
Dado que o processamento concluiu ou divergência bloqueante foi gerada, o usuário recebe notificação in-app em até 30 segundos.

### CA12 — Auditoria registrada
Dado que um campo foi corrigido manualmente, o sistema registra usuário, campo, valores anterior e novo, data/hora e justificativa.

### CA13 — Remessa adicional processada
Dado que o usuário sobe novos documentos em um fechamento já processado, o sistema processa apenas os novos, integra com os existentes e preserva correções manuais.

### CA14 — Bloqueio sem prestação
Dado que o fechamento contém apenas comprovante de repasse, o sistema bloqueia aprovação com alerta específico informando que a prestação está ausente.

---

## 23. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| PDFs com baixa qualidade | IA visual/OCR; armazenar confiança por campo; revisão humana obrigatória abaixo de 0,70 |
| Layouts mudam com frequência | Parsers por imobiliária; versionamento; correção manual; monitorar campos não reconhecidos |
| IA extrai valor incorreto | Validações determinísticas; comparar totais; cruzar com comprovantes; revisão em baixa confiança |
| Integração com eGestor não refletir estrutura interna | Camada de mapeamento; não modelar banco limitado pelo eGestor |
| Usuário confiar cegamente no processamento | Tela de revisão clara; alertas objetivos; documento original sempre visível; aprovação humana obrigatória |
| Timeout no processamento | Job assíncrono; timeout de 5 min por documento; reprocessamento sempre disponível; notificação de erro |
| Merge incorreto na remessa adicional | Chave de deduplicação por hash; preservar flag `corrigido_manualmente`; log de auditoria de cada merge |
| Multi-tenancy no futuro | Decisão documentada; schema preparado para adicionar `proprietario_id` |

---

## 24. Métricas de sucesso

### Operacionais
```
tempo médio para fechar uma competência
percentual de documentos processados sem intervenção manual
quantidade de divergências encontradas por fechamento
tempo médio de revisão
percentual de campos com confiança < 0,70
quantidade de timeouts por mês
quantidade média de remessas por fechamento
```

### Financeiras
```
valor total conciliado
valor total de divergências identificadas
despesas sem comprovante
repasses divergentes
```

### Produto
```
quantidade de fechamentos processados por mês
quantidade de imobiliárias suportadas
quantidade de layouts suportados
número de correções manuais por fechamento
```

---

## 25. Perguntas em aberto — classificadas por urgência

### Bloqueia Sprint 1 — responder antes de começar

| # | Pergunta | Owner |
|---|---|---|
| 13 | Qual será a estrutura oficial de empreendimentos e imóveis? | Arthur |
| 14 | Os imóveis terão códigos internos próprios ou códigos por imobiliária? | Arthur |
| 10 | Quem pode aprovar fechamento com divergência bloqueante justificada? | Arthur |
| 11 | O sistema deve aceitar fechamento sem comprovante de repasse? | Arthur |
| 15 | O sistema deve importar imóveis de uma base já existente? | Arthur |
| 6 | Toda despesa precisa ter comprovante obrigatório? | Arthur |

### Bloqueia Fase 3

| # | Pergunta |
|---|---|
| 8 | Como tratar inadimplência parcial? |
| 9 | Como tratar imóvel vago com nova locação no meio da competência? |

### Bloqueia Fase 4 (eGestor) — responder antes de iniciar

| # | Pergunta |
|---|---|
| 1 | O lançamento será consolidado por imobiliária/competência ou detalhado por imóvel? |
| 2 | Quais tags/categorias já existem no eGestor? |
| 3 | O eGestor permite anexar comprovantes via API? |
| 4 | Existe conta de teste no eGestor? |
| 5 | Qual será a regra oficial para despesas pagas pela imobiliária? |

### Pós-MVP

| # | Pergunta |
|---|---|
| 12 | Haverá múltiplos proprietários no mesmo sistema? (decisão atual: não — ver seção 6) |

---

## 26. Conclusão

O módulo deve ser construído como uma camada própria de fechamento e conciliação financeira imobiliária.

Princípios de desenvolvimento:
```
Sistema próprio como centro do fluxo.
n8n fora do MVP.
IA (Claude API) como apoio à extração e classificação.
Código determinístico para cálculo e validação.
Supabase como banco de dados e fonte de verdade.
Revisão humana antes de qualquer lançamento.
eGestor como destino financeiro, não como origem da lógica interna.
Single-tenant no MVP; multi-tenant como evolução futura documentada.
Parcelas de IPTU e seguro modeladas explicitamente desde o MVP 1.
Parser Alive cobre as 4 seções da prestação real.
Tolerâncias e janelas configuráveis por imobiliária.
Documentos chegam em múltiplas remessas — o fechamento suporta isso nativamente.
Remessas adicionais são processadas parcialmente sem perder trabalho anterior.
```

O MVP começa com o caso Alive / GM II porque concentra os principais desafios: prestação com 4 seções distintas, reajustes, atrasados com atualização monetária, acordos e rescisões em parcelas, despesas de múltiplos fornecedores, boletos e comprovantes em PDF, conciliação documental completa e chegada de documentos em momentos diferentes.

Após validar esse fluxo ponta a ponta, os layouts da Cesar Rego e da Plural podem ser adicionados como novos parsers sobre a mesma estrutura canônica.
