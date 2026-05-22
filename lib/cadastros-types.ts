export type Imobiliaria = {
  id: string
  nome: string
  cnpj: string | null
  email: string | null
  telefone: string | null
  layout: string
  ativo: boolean
  tolerancia_repasse_reais: number | null
  janela_antes_dias: number | null
  janela_depois_dias: number | null
  egestor_tag_id: string | null
  observacoes: string | null
}

export type Empreendimento = {
  id: string
  nome: string
  codigo: string | null
  descricao: string | null
  endereco: string | null
  ativo: boolean
  egestor_tag_id: string | null
}

export type ImovelStatus = "ocupado" | "vago" | "inadimplente" | "em_rescisao" | "em_negociacao" | "inativo"

export type Imovel = {
  id: string
  empreendimento_id: string
  imobiliaria_id: string
  codigo_imobiliaria: string
  unidade: string
  tipo: string | null
  inquilino_nome: string | null
  status: ImovelStatus
  valor_aluguel_esperado: number | null
  taxa_administracao_percent: number | null
  ativo: boolean
  egestor_tag_id: string | null
  observacoes: string | null
  imobiliarias?: { nome: string } | null
  empreendimentos?: { nome: string } | null
}

export type CadastrosPayload = {
  imobiliarias: Imobiliaria[]
  empreendimentos: Empreendimento[]
  imoveis: Imovel[]
}

export type CsvImportResult = {
  created: number
  updated: number
  errors: Array<{ line: number; message: string }>
}
