# 03 - Domain Model

## Status do fechamento

Fluxo canonico:

`rascunho -> arquivos_enviados -> processando -> processado_com_sucesso | processado_com_alertas -> pendente_revisao -> documentos_adicionados -> reprocessando_parcial -> processado_com_sucesso | processado_com_alertas -> aprovado -> preparado_egestor -> lancado_egestor`

Estados excepcionais: `erro`, `cancelado` e `erro_egestor`.

O fechamento aceita novos documentos em qualquer status, exceto `aprovado` e `lancado_egestor`.

## Entidades principais

- Fechamento: imobiliaria, empreendimento, competencia, status, totais, valor comprovado, diferenca, tolerancia, aprovacao e auditoria.
- Fonte documental: binário original imutável identificado por SHA-256 e
  reutilizável entre fechamentos sem compartilhar valores ou vínculos.
- Documento do fechamento: vínculo contextual entre fonte e fechamento, com
  tipo, status de processamento, confiança, parser, erro, classificação manual,
  remessa e referência de duplicidade; redundância é preservada e marcada, não
  apagada.
- Imobiliaria: nome, CNPJ, layout, tolerancia de repasse e janela de conciliacao.
- Empreendimento: agrupador de imoveis.
- Regra comercial: taxa de administracao e taxa de intermediacao por imobiliaria + empreendimento, com uma regra ativa por par.
- Imovel: unidade e posição cadastral atual, separada do histórico.
- Vigência do imóvel: período com início/fim, modelo de receita
  `fixo|variavel|nao_aplicavel`, aluguel contratado nullable e fonte
  rastreável. É a fonte da cobertura e do contrato em cada competência.
- Imovel por competencia: snapshot mensal imutavel na leitura, ligado ao imovel e ao fechamento que o materializou, com status de ocupacao, aluguel contratado da vigência, aluguel da competência, atrasos recuperados, outros recebimentos, entradas/saídas de passagem, competência original/recebimento, dia de vencimento, receita, desconto, comissao, repasse, origem, qualidade, versao de calculo e checksum. O cadastro do imovel continua sendo a fonte separada da posicao atual ("Hoje").
- Movimentacao: receitas, despesas, comissoes, descontos, repasses, parcelas, origem documental, confianca, imóvel vinculado, competência original e correcao manual.
- Receita por imóvel: linha da prestação com `competencia_original`, `competencia_recebimento`, `dia_vencimento` e `imovel_id`; os quatro conceitos são independentes e o vínculo só existe quando o ID foi persistido.
- Acordo/rescisao recebido: item extraido da prestacao quando houver pagamento, acordo, rescisao, parcela ou decisao recebida no mes, com tipo, inquilino, unidade, valor, competencia original, competencia de recebimento, observacao e confianca.
- Comprovante: repasse, boleto, pix, TED/DOC, valor, datas, partes, codigo/autenticacao e conciliacao.
- Validacao: alerta ou divergencia com severidade, status, valores esperados/encontrados e justificativa.
- Mapeamento eGestor: categorias internas para categorias/tags/contas do eGestor.
- Integracao eGestor V1: fechamento aprovado gera lancamentos automáticos consolidados em `egestor_lancamentos`; repasse mensal vira `recebimento`; comissao administrativa e despesas agrupadas viram `pagamentos`; linhas manuais podem repetir tipo/categoria porque a idempotência usa `origem_chave`; envio real grava codigos eGestor e tentativas em auditoria tecnica.
- Envio eGestor: `egestor_envios` registra acao, payload, resposta, status e erro de envio, retry de anexo e revalidacao.
- Auditoria de status: `fechamento_status_eventos` registra status anterior, status novo, usuario, motivo e data/hora para aprovacao e transicoes eGestor.
- Revalidacao eGestor: lancamento enviado pode gravar `revalidado_em`, `revalidacao_status` e `revalidacao_mensagem`; revalidacao nao cria novo lancamento financeiro.
- Cobertura de indicadores: vigências ativas na competência agrupadas por
  imobiliária + empreendimento e comparadas aos fechamentos elegíveis e
  snapshots. Regras comerciais e aliases inativos não criam expectativa.

## RBAC

Papeis do MVP:

- `visualizador`: consulta.
- `operador`: cria fechamento, envia documentos, classifica, revisa e corrige campos.
- `aprovador`: aprova fechamentos e justifica bloqueantes quando permitido.
- `admin`: configura regras, parsers, usuarios e permissoes.

Aprovacao exige papel `aprovador` ou `admin`.

O perfil vive em `auth.users.raw_app_meta_data.role` e é propagado pelo JWT.
Ausência ou valor inválido cai em `visualizador` (fail-closed). Mutações exigem
no mínimo `operador`; resolução bloqueante e aprovação exigem `aprovador`; APIs
de usuários e configuração eGestor exigem `admin`.

## Regras financeiras

- Competência original é o mês/ano a que cada receita pertence; competência do fechamento/recebimento é o mês em que o dinheiro entrou. Uma não sobrescreve a outra.
- Dia de vencimento é inteiro de 1 a 31. Um valor isolado como `10` nunca satisfaz a competência original.
- Referência de IPTU, seguro ou outra despesa não pode ser inferida como competência do aluguel. Competência ausente ou inválida bloqueia aprovação.
- A movimentação `receita_aluguel` usa a competência original; o fechamento preserva o total do mês de recebimento.
- IPTU de passagem é separado da receita/despesa econômica, mas entra na ponte
  como entrada e/ou saída de passagem; assim o caixa reconcilia sem inflar
  desempenho.
- Receita só está vinculada quando a linha e a movimentação apontam para um `imovel_id` ativo do mesmo par imobiliária + empreendimento; código/unidade equivalente serve apenas como sugestão.
- Correções de competência ou vínculo atualizam fechamento, movimentação, validações, cadastro quando aplicável e auditoria na mesma transação.
- Divergencia de repasse:
  - ate R$ 0,10: baixa;
  - acima de R$ 0,10 ate R$ 5,00: alta;
  - acima de R$ 5,00: bloqueante.
- Janela padrao de conciliacao: inicio da competencia menos 15 dias ate fim da competencia mais 45 dias.
- Prestacao ausente gera alerta bloqueante e impede aprovacao.
- Reprocessamento parcial deve preservar correcoes manuais.
- O claim de processamento é uma operação condicional única no banco; dois
  requests concorrentes não podem iniciar jobs para o mesmo fechamento.
- A persistência derivada troca fechamento, movimentações automáticas,
  validações e snapshots na mesma transação e sob `atualizado_em` otimista.
- IA deve retornar JSON validavel e nunca aprovar ou calcular resultado final sem validacao deterministica.
- Documento opcional ausente não é pendência operacional. Sem documento de despesas e sem valor de despesa identificado, o total R$ 0,00 é uma validação aprovada; alerta só existe quando há valor ou evidência que exige conferência.
- Comissao administrativa deve ser validada, quando houver regra comercial ativa, pela taxa do par imobiliaria + empreendimento aplicada sobre o total pago pelo inquilino: aluguel com desconto quando existir, senao aluguel, somado a garagem, agua, IPTU e seguro incendio.
- Na intermediação documentada, `valor` representa o aluguel/base da comissão. IPTU não entra na base percentual, mas compõe o total recebido e o repasse da linha; a revisão deve exibir base, IPTU, total, comissão, percentual e repasse sem conflar esses conceitos.
- Taxa de intermediacao cadastrada permanece apenas como regra comercial; o lançamento documentado é a fonte operacional da comissão efetivamente retida.
- Comissao realizada em percentual e calculada como comissao administrativa documentada dividida pela base de comissao administrativa.
- Acordo/rescisao com mesma combinacao normalizada de tipo, inquilino, competencia original e valor ja vista no pacote ou no historico do mesmo par imobiliaria + empreendimento gera alerta bloqueante por possivel pagamento repetido.
- Acordo/rescisao recebido no mes com competencia original diferente da competencia do fechamento gera alerta operacional para revisao.
- Lancamento eGestor com `egestor_codigo` salvo e imutavel para reenvio V1; operador pode apenas revalidar status ou reenviar anexos pendentes.
- No layout César Rêgo, `SIT=ALUG` sem lançamento na competência é inadimplência explícita. A TED global é dividida igualmente entre os empreendimentos do extrato antes do rateio interno por imóvel. Totais, rechecks, guardrails e parecer são recalculados somente depois desse recorte; linha sem recebimento usa comissão e repasse iguais a zero na validação das colunas.
- Quando a prestação informa `data_vencimento`, ela define `dtVenc` e, na ausência de comprovante externo, também `dtCred`/`dtPgto`; a data real do comprovante prevalece apenas na liquidação.
- Falha de anexo eGestor nao desfaz recebimento/pagamento criado; o lancamento fica `anexo_pendente` ate retry bem-sucedido.
- Indicadores incluem apenas fechamentos nao arquivados, com `analise_completa`, nos status `pendente_revisao`, `processado_com_sucesso`, `processado_com_alertas`, `aprovado`, `preparado_egestor`, `lancado_egestor` e `erro_egestor`. Reprocessamento ativo preserva a ultima analise valida e sinaliza "Em atualizacao".
- A confiança da competência é `confirmado`, `em_conferencia`, `incompleto` ou
  `com_divergencia`. Confirmação exige cobertura integral, fechamento final,
  nenhum valor não explicado e comprovantes externos necessários.
- Receitas do fechamento, aluguel contratado, aluguel recebido da competência,
  atrasos recuperados, outros recebimentos e movimentos de passagem são
  conceitos independentes. Contratado vem da vigência; receita variável é
  `nao_aplicavel`, nunca zero.
- Ponte financeira: `receitas econômicas + entradas de passagem - comissões -
  despesas - tarifas - saídas de passagem = repasse calculado`, tolerância de
  R$ 0,01. Repasse declarado pela imobiliária é separado do confirmado pelo
  banco; a diferença bancária só usa fechamentos comprovados.
- Realização do aluguel: `contratado - vacância - inadimplência - descontos +
  ajustes classificados = recebido da competência`; somando atrasos
  recuperados obtém-se o aluguel recebido no mês.
- Status mensal do imovel e um de `ocupado`, `inadimplente`, `vago`, `em_rescisao` ou `desconhecido`. Zero sem evidencia suficiente e `desconhecido`, nunca vacancia.
- Taxa de ocupacao mensal usa ocupado + inadimplente + em rescisao no numerador e adiciona vago no denominador; desconhecidos ficam fora do denominador e reduzem a cobertura.
- `null` significa dado ausente; `0` significa zero confirmado;
  `nao_aplicavel` significa conceito incompatível com o modelo de receita.
  Series terminam na competencia selecionada e taxas agregadas sao ponderadas
  pelos seus denominadores.
