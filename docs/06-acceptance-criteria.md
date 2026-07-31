# 06 - Acceptance Criteria

## Etapa 1 - App vivo sem IA

- CA01: dado imobiliaria, empreendimento e competencia, o sistema cria fechamento em `rascunho`.
- CA02: dado upload de arquivos, o sistema armazena, gera hash e vincula ao fechamento com `remessa_numero = 1`.
- CA03 parcial: documentos podem ser classificados manualmente quando a automatica nao estiver disponivel.
- CA09 parcial: usuario visualiza a tela de revisao com dados persistidos.
- CA12 parcial: correcoes manuais geram registro de auditoria.

## Etapa 2 - Extracao basica

- CA03: pacote Alive / GM II identifica prestacao, comprovante de repasse, relatorio de reajuste e despesas/comprovantes.
- CA04 parcial: secao 1 da prestacao GM II e extraida por apartamento.
- CA05: comprovante bancario extrai valor, data, pagador, recebedor e protocolo.
- CA07 parcial: repasse e prestacao sao conciliados quando valor e janela forem compativeis.
- CA08: divergencia de repasse gera alerta com severidade correta.
- CA13 parcial: remessa adicional processa documentos novos sem apagar dados anteriores.

## Etapa 3 - Extracao completa e aprovacao

- CA04 completo: prestacao GM II extrai secoes 1, 2, 3 e 4.
- CA06: despesas Alive extraem ENEL, CAGECE, IPTU, seguros e comprovantes.
- CA07: despesas e comprovantes conciliam por valor, beneficiario e janela de data.
- CA10: aprovacao e bloqueada quando ha divergencia bloqueante aberta.
- CA10.1: possivel acordo/rescisao repetido bloqueia aprovacao ate resolucao ou justificativa.
- CA11: notificacao in-app chega em ate 30 segundos apos conclusao ou bloqueante.
- CA12 completo: toda correcao manual registra usuario, campo, valores, data/hora e justificativa.
- CA12.1: resolucao de pendencia salva o valor oficial escolhido pelo operador e nunca chama a API com id de validacao vazio.
- CA14: fechamento apenas com comprovante de repasse bloqueia aprovacao por prestacao ausente.
- CA14.1: fechamento `rascunho` sem job ativo aparece como "Aguardando documentos" e direciona ao upload; apenas job ativo aparece como "Processando", e falha registrada oferece nova tentativa. Acesso direto à Revisão sem `analise_completa` também redireciona ao upload e nunca exibe uma revisão vazia.
- CA14.2: intermediação com IPTU preserva aluguel como base percentual, exibe o IPTU separadamente e calcula `total recebido = aluguel + IPTU` e `repasse = total recebido - comissão`, respeitando valores explícitos do documento.
- CA14.3: a validação do resumo final subtrai a comissão de intermediação separadamente da comissão administrativa e das despesas, sem gerar divergência falsa nem duplicar a retenção.
- CA14.4: cada receita separa competência original, competência de recebimento e dia de vencimento; `10` isolado é dia, referência de IPTU não vira competência de aluguel e ausência aparece como “-”.
- CA14.5 (revisado em 2026-07-15): a coluna `Ref.` exibe a competência original extraída do documento em mês/ano, somente leitura; competência ausente não bloqueia a aprovação nem gera recheck bloqueante.
- CA14.6: fechamento de maio pode conter aluguel de março sem mover o total de caixa de maio; a movimentação da receita usa março em `data_competencia` e isso não cria inadimplência corrente por inferência.
- CA14.11: na série mensal dos indicadores, receita e aluguel recebido são atribuídos à competência original (aluguel de março pago em maio conta em março); o resumo da competência, a ponte financeira e o repasse permanecem por caixa do mês do fechamento.
- CA14.7: a quebra superior de Receitas mostra IPTU de passagem de R$ 193,02 + R$ 149,02 = R$ 342,04 no Pompílio maio, inclusive para observação legada, sem alterar receita total, despesa ou repasse.
- CA14.8: em todo fechamento, mesmo sem linhas por imóvel, despesas aparecem em Energia, Água e esgoto, IPTU, Seguros, Tarifas, Ajustes e Outros; cada grupo expõe descrição completa, referência e valor por mouse, teclado e toque. Quando só existe total consolidado, “Outros” explicita o valor ainda não discriminado em vez de omitir o breakdown.
- CA14.9: GM II maio exibe taxa cadastrada de 7%, comissão regular de R$ 1.218,45, comissão de acordos/rescisões de R$ 65,52 e total de R$ 1.283,97 sem dupla contagem.
- CA14.9.1: a quebra superior de receitas inclui Acordos, Rescisões, Inadimplência paga e Outros recebimentos quando esses itens existirem em `acordos_rescisoes_recebidos`; Intermediação permanece em categoria própria e nenhum valor é somado duas vezes.
- CA14.10: receita só deixa a pendência de cadastro com `imovel_id` persistido; o drawer permite buscar/criar, comparar e optar por atualizações sem sobrescrita silenciosa, e aprovação permanece bloqueada enquanto houver pendência.
- CA14.11: correção de competência ou vínculo grava análise, movimentação, validações, cadastro quando aplicável e auditoria em uma única transação; falha em qualquer etapa reverte tudo.
- CA14.12: o upload valida a assinatura real de PDF/Excel, normaliza MIME ausente ou genérico antes de enviar à IA e identifica em português o nome do arquivo inválido ou corrompido.
- CA14.13: criar cadastro de imóvel com código canônico César Rêgo (0002520/0002521 → João Cordeiro; 0002526/0002527 → Galpão Pompílio Gomes) no empreendimento errado é bloqueado com HTTP 409 e mensagem acionável orientando corrigir o empreendimento do fechamento em vez de criar outro cadastro; a revisão não oferece criar/vincular unidade já cadastrada nesses códigos.
- CA14.14: ao resolver uma pendência sem valor a decidir (documento opcional ausente ou alerta informativo — sem valor esperado, encontrado ou diferença), o modal omite os cards de valor e a escolha de valor oficial e oferece apenas "Ignorar pendência" com justificativa obrigatória; a resolução registra auditoria e libera a pendência sem alterar nenhum valor da prestação.

## Lista de fechamentos

- CA-FEC01: busca textual e filtros por status, competencia, imobiliaria e empreendimento funcionam em conjunto; busca ignora acentos e tambem encontra o rotulo de status.
- CA-FEC02: competencia, imobiliaria, empreendimento, status e valores financeiros permitem ordenacao crescente/decrescente; o padrao e competencia mais recente, valores ausentes permanecem ao final e a lista pagina 25 itens.
- CA-FEC03: busca, filtros, ordenacao, pagina e inclusao de arquivados persistem na URL; filtros sem correspondencia exibem estado vazio com acao para limpar a consulta.
- CA-FEC04: a lista nao causa overflow horizontal da pagina; em larguras menores, somente a regiao da tabela rola. Cabecalhos ordenaveis, filtros, paginacao e acoes sao operaveis por teclado, com foco visivel e nomes acessiveis.

## Indicadores

- CA-IND01: o mapa de inadimplência usa seis faixas progressivas de verde (baixo/bom) a vermelho (alto/atenção), passando por amarelo e laranja; vacância por imóvel/competência usa estado binário de 0% (não vago) ou 100% (vago), com legenda própria.
- CA-IND02: a API inclui apenas fechamentos elegiveis, exclui rascunhos/arquivados/analises ausentes e mantem a ultima analise valida com estado "Em atualizacao" durante reprocessamento.
- CA-IND03: toda competência informa fechamentos esperados/processados e contratos conhecidos/não aplicáveis/ausentes a partir das vigências históricas; regras ou aliases inativos não criam cobertura. O banner único usa `Confirmado`, `Em conferência`, `Incompleto` ou `Com divergência`, sem repetir justificativas técnicas internas como ressalva textual.
- CA-IND04: Receitas do fechamento, aluguel recebido da competência, atrasos recuperados, outros recebimentos, movimentos de passagem, comissões, despesas, tarifas e repasses calculado/declarado/confirmado seguem as fontes da revisão v2 de `docs/PLAN-indicadores-operacionais.md`; `—`, `R$ 0,00` e `Não se aplica` permanecem semanticamente distintos.
- CA-IND05: a ponte é `receitas econômicas + entradas de passagem − comissões − despesas − tarifas − saídas de passagem = repasse calculado`; diferença não explicada acima de R$ 0,01 impede `Confirmado`. A diferença bancária usa somente fechamentos com comprovante externo e informa a cobertura desses comprovantes.
- CA-IND06: realização reconcilia `contratado − vacância − inadimplência − descontos + ajustes classificados = recebido da competência`; atrasos recuperados são somados depois. Qualquer valor sem classificação aparece como “Valores ainda sem classificação” e impede `Confirmado`.
- CA-IND07: ocupação da competência usa snapshots mensais com status ocupado, inadimplente, vago, em rescisão ou desconhecido; inadimplência explícita da competência prevalece sobre pagamento antigo. O painel mostra percentual, base classificada e cobertura juntos; cadastro atual permanece separado como “Hoje”.
- CA-IND08: filtros de competencia, empresa, empreendimento e imovel por UUID recalculam todos os indicadores; aba e modos `metric`/`heatMetric` persistem na URL; requests obsoletos nao sobrescrevem o estado mais novo.
- CA-IND09: serie, ranking, mapa e tabela respeitam a competencia selecionada e nao exibem meses futuros; medias e taxas da carteira sao ponderadas.
- CA-IND10: a quarta aba se chama “Detalhamento por imóvel”, informa competência do aluguel, recebido em e dia do vencimento, e oferece uma linha por imóvel/competência, busca, ordenação, paginação e CSV.
- CA-IND11: “Riscos por imóvel” deriva apenas dos snapshots, separa em cada unidade meses registrados de meses com status definido, exibe `—` com “Sem dados no mês” para ausente, prioriza o estado mensal antes do percentual e do valor e separa a coluna “Hoje”. A origem recomposta não vira selo repetitivo; quando a auditoria exige a origem, a interface usa “Importado de documentos”.
- CA-IND12: `/indicadores` e o shell funcionam sem overflow da pagina em 360, 390, 768, 1024, 1280 e 1440 px; título, filtros e cobertura reorganizam suas colunas conforme a área útil, e tabs, toggles, tabelas e menu sao operaveis por teclado, com foco visivel, contraste AA e reduced motion.
- CA-IND13: o painel usa valores monetários completos nos KPIs, um único banner de confiança, ajuda “Como ler este painel” e informação contextual acessível por mouse, teclado e toque.
- CA-IND14: upload repetido no mesmo fechamento é idempotente por SHA-256; uma fonte pode ser reutilizada entre fechamentos sem compartilhar valores/vínculos; redundâncias são preservadas com referência de duplicidade.
- CA-IND15: o reparador é dry-run por padrão, exige `--commit`, registra antes/depois e bloqueia qualquer fechamento com diferença documental acima de R$ 0,01.
- CA-IND16: o reparo César Rêgo vincula as linhas históricas aos cadastros canônicos existentes e envia à RPC apenas movimentações `receita_aluguel`; as despesas de rateio da TED não vazam para `p_receitas`. Após o reparo, não há receita César Rêgo sem vínculo válido nem cadastro no empreendimento errado.
- CA-IND17: a base da comissão de administração é a soma das receitas comissionáveis das linhas do próprio fechamento (aluguel com desconto quando houver, garagem, água, IPTU e seguro incêndio) — nunca herdada do documento consolidado. No reparo por empreendimento, `base_comissao_administracao` e `comissao_administracao_calculada` são recalculadas das linhas restritas. Ex.: Pompílio junho, 4% × (12.032,74 + 342,04) = 494,99, igual à comissão real.
- CA14.15: o "Valor calculado" da comissão exibe tooltip com a decomposição da base (aluguel + garagem + água + IPTU + seguro), a taxa cadastrada e o resultado, permitindo conferir a leitura contra a tabela do documento.

## IPTU - Contas a pagar manual

- CA-IPTU01: ao acessar `/iptu`, o usuario ve uma tabela densa de parcelas (nao uma tela centrada em upload); a acao primaria e "Gerar parcelas" e nao ha upload de certidao/PDF na experiencia principal.
- CA-IPTU02: os filtros (imobiliaria, empreendimento, ano, status, mes de vencimento e busca) funcionam em conjunto e a tabela mostra vencimento, valor previsto, valor pago, data de baixa, responsavel e status.
- CA-IPTU03: a geracao em lote permite selecionar multiplos imoveis, definir ano, numero de parcelas, vencimentos e valor padrao, exibe uma revisao antes de confirmar (parcelas e total por imovel + total geral) e alerta/impede duplicidade por imovel+ano; a criacao e transacional.
- CA-IPTU04: a baixa individual e em massa exige `data_baixa`, inicia `valor_pago` com o valor previsto (ajustavel), bloqueia parcelas ja pagas e executa em transacao, retornando resumo (qtd, total previsto, total pago, imoveis).
- CA-IPTU05: a edicao permite alterar vencimento, valor previsto, observacoes e responsavel; parcelas pagas nao permitem alterar vencimento/valor previsto; o status e recalculado apos a alteracao.
- CA-IPTU06: o status e calculado (`pago` com `data_baixa`; `vencido` sem baixa e vencimento anterior a hoje; `aberto` sem baixa com vencimento hoje ou futuro), usando a data local e sem persistir status.
- CA-IPTU07: o ajuste do numero de parcelas do carne cria apenas parcelas adicionais ao aumentar e bloqueia a reducao abaixo de parcelas ja pagas.
- CA-IPTU08: nenhuma baixa ou alteracao de IPTU gera lancamento no eGestor nem impacta o fechamento financeiro.

## Etapa 4 - Futuro

- CA15: configuracao eGestor deve permitir token, teste de conexao, conta disponivel padrao, contato/tag por imobiliaria, tag por empreendimento e plano de contas por categoria.
- CA16: previa eGestor deve listar lancamentos, categorias, tags, contas, descricoes, valores e status de validacao.
- CA17: envio real ao eGestor so deve ocorrer apos fechamento aprovado, previa validada e confirmacao explicita do operador.
- CA18: envio deve ser idempotente; fechamento com codigo eGestor salvo nao pode reenviar os mesmos lancamentos.
- CA19: falha de anexo nao desfaz lancamento financeiro; o item fica marcado como anexo pendente para retry futuro.
- CA20: anexos pendentes podem ser reenviados sem recriar recebimento/pagamento e com nova tentativa registrada em `egestor_envios`.
- CA21: lancamentos enviados podem ser revalidados por codigo eGestor, gravando status, mensagem e horario sem alterar a idempotencia financeira.
- CA22: aprovacao e transicoes eGestor devem gerar trilha de status do fechamento visivel na revisao.
