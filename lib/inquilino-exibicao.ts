// Layouts que nao imprimem o nome do inquilino (Cesar Rego: Relacao de Imoveis)
// gravam o ENDERECO da unidade no campo inquilino, para a linha nao sair em
// branco ("RUA EXEMPLO,230", "RUA MODELO,100 APART. A"). O dado extraido
// fica como esta, porque e o que o documento traz; na tela, quem nomeia o
// inquilino e o cadastro (Galpao Pompilio Gomes, ago/2026: o cliente via o
// endereco na Revisao e no mapa com o inquilino ja cadastrado).
//
// Nome de pessoa ou empresa nao tem digito; endereco tem numero. Medido em
// 2026-11-05: 0 de 119 nomes do cadastro tem digito, e todo "inquilino" extraido
// com digito era endereco.
export function pareceIdentificacaoDoImovel(nome: string | null | undefined): boolean {
  return /\d/.test(nome ?? "")
}

/**
 * Nome a exibir para o inquilino de uma linha extraida. O cadastro so substitui
 * o extraido quando este e a identificacao do imovel; nome real do documento
 * continua valendo (inclusive quando diverge do cadastro, ex.: troca de
 * inquilino ainda nao sincronizada). Linha sem nome continua sem nome: unidade
 * vaga nao herda o ultimo inquilino cadastrado.
 */
export function inquilinoParaExibir(
  extraido: string | null | undefined,
  cadastro: string | null | undefined,
): string | null {
  const doDocumento = extraido?.trim() || null
  if (doDocumento === null || !pareceIdentificacaoDoImovel(doDocumento)) return doDocumento
  const doCadastro = cadastro?.trim() || null
  if (doCadastro === null || pareceIdentificacaoDoImovel(doCadastro)) return doDocumento
  return doCadastro
}

/** Nome extraido que pode ir para o cadastro: identificacao do imovel nao vai. */
export function inquilinoParaCadastro(extraido: string | null | undefined): string | null {
  const nome = extraido?.trim() || null
  return nome !== null && pareceIdentificacaoDoImovel(nome) ? null : nome
}
