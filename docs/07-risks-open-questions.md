# 07 - Risks and Open Questions

## Riscos principais

- PDFs com baixa qualidade: usar IA visual/OCR, confianca por campo e revisao humana abaixo de 0,70.
- Layouts mudam: parsers por imobiliaria, versionamento e monitoramento de campos nao reconhecidos.
- IA extrai valor errado: validacoes deterministicas, comparacao de totais e revisao por baixa confianca.
- eGestor limita o modelo: manter camada interna propria e mapear apenas na saida.
- eGestor pode aceitar lancamento financeiro e rejeitar anexo: tratar anexos como etapa independente com retry e historico proprio.
- eGestor pode retornar 429/5xx em janelas de instabilidade: cliente deve respeitar retry limitado e registrar erro sem duplicar lancamentos.
- Usuario confia cegamente: revisao clara, documento original acessivel e aprovacao humana obrigatoria.
- Timeout: jobs assincronos, limite de 5 minutos por documento e reprocessamento disponivel.
- Merge incorreto em remessa adicional: deduplicar por hash, preservar `corrigido_manualmente` e auditar merge.
- Multi-tenancy futuro: decisao documentada; adicionar `proprietario_id` so quando houver expansao.

## Perguntas que bloqueiam Sprint 1

- Qual sera a estrutura oficial de empreendimentos e imoveis?
- Os imoveis terao codigos internos proprios ou codigos por imobiliaria?
- Quem pode aprovar fechamento com divergencia bloqueante justificada?
- O sistema deve aceitar fechamento sem comprovante de repasse?
- O sistema deve importar imoveis de uma base ja existente?
- Toda despesa precisa ter comprovante obrigatorio?

## Perguntas que bloqueiam Fase 3

- Como tratar inadimplencia parcial?
- Como tratar imovel vago com nova locacao no meio da competencia?

## Perguntas que bloqueiam Fase 4

- Respondido: lancamento V1 sera consolidado por fechamento/imobiliaria/competencia, nao por imovel.
- Respondido: mapeamentos oficiais ficarao no ACR, configurados por categoria, imobiliaria e empreendimento.
- Respondido tecnicamente: eGestor possui `discoVirtual`; anexos serao tentados apos o lancamento financeiro e falha nao desfaz o envio.
- Pendente operacional: validar escrita real em ambiente/conta controlada antes de usar em producao.
- Respondido: despesas pagas pela imobiliaria entram como pagamentos separados, sem dupla contagem no repasse.
- Respondido: revalidacao de status consulta codigos eGestor ja salvos e nao reabre envio financeiro.

## Pos-MVP

- Havera multiplos proprietarios no mesmo sistema? Decisao atual: nao.
