// Contratos de locação declarados por imóvel (tabela `imovel_contratos`).
// O vigente também vive em `imoveis.contrato_*`; esta lista tem todos.

export interface ImovelContrato {
  id: string
  imovel_id: string
  locatario: string | null
  inicio: string
  termino: string | null
  fonte: string | null
}

/** O imóvel da unidade, com o prazo vigente como o cadastro o guarda. */
export interface ImovelDoContrato {
  id: string
  inquilino_nome: string | null
  contrato_inicio: string | null
  contrato_termino: string | null
  contrato_locatario: string | null
  contrato_fonte: string | null
}

export interface ContratosDoImovel {
  imovel: ImovelDoContrato | null
  contratos: ImovelContrato[]
}
