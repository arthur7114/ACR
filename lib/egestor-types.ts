export type EgestorTipoLancamento = "recebimento" | "pagamento"

export type EgestorCategoria =
  | "repasse_mensal"
  | "comissao_administrativa"
  | "energia"
  | "agua"
  | "iptu"
  | "seguro"
  | "outras_despesas"

export type EgestorLancamentoStatus = "validado" | "pendente_config" | "enviado" | "erro" | "anexo_pendente"

export type EgestorConta = {
  id: string
  nome: string
  token_configurado: boolean
  token_mascarado: string | null
  cod_disponivel_padrao: number | null
  ativo: boolean
  ultimo_teste_status: string | null
  ultimo_teste_mensagem: string | null
  ultimo_teste_em: string | null
}

export type EgestorMapeamentoCategoria = {
  conta_id: string
  categoria: EgestorCategoria
  tipo_lancamento: EgestorTipoLancamento
  cod_plano_contas: number | null
  tags: string[]
  descricao: string | null
  ativo: boolean
}

export type EgestorImobiliariaContato = {
  conta_id: string
  egestor_contato_id: number | null
}

export type EgestorLancamento = {
  id: string
  fechamento_id: string
  tipo: EgestorTipoLancamento
  categoria: EgestorCategoria
  descricao: string
  valor: number
  cod_contato: number | null
  cod_disponivel: number | null
  cod_plano_contas: number | null
  disponivel_nome?: string | null
  tags: string[]
  payload: Record<string, unknown>
  status: EgestorLancamentoStatus
  validacao_mensagem: string | null
  egestor_codigo: number | null
  egestor_cod_modulo: number | null
  anexo_status: string | null
  anexo_mensagem: string | null
  revalidado_em?: string | null
  revalidacao_status?: string | null
  revalidacao_mensagem?: string | null
}

export type EgestorEnvio = {
  id: string
  fechamento_id: string
  lancamento_id: string | null
  acao: string
  status: string
  erro: string | null
  criado_em: string
  request_payload?: Record<string, unknown> | null
  response_payload?: Record<string, unknown> | null
}

export type EgestorConfigPayload = {
  contas: EgestorConta[]
  mapeamentos: EgestorMapeamentoCategoria[]
  imobiliarias: Array<{ id: string; nome: string; egestor_tag_id: string | null; contatos: EgestorImobiliariaContato[] }>
  empreendimentos: Array<{ id: string; nome: string; egestor_tag_id: string | null; egestor_conta_id: string | null }>
}
