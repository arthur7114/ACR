const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validarNovoUsuario(input: { email: unknown; senha: unknown }) {
  const email = typeof input.email === "string" ? input.email.trim() : ""
  if (!email) throw new Error("Informe um e-mail.")
  if (!EMAIL_RE.test(email)) throw new Error("E-mail invalido.")

  const senhaInformada = typeof input.senha === "string" ? input.senha.trim() : ""
  const senha = senhaInformada.length >= 8 ? senhaInformada : gerarSenhaTemporaria()

  return { email, senha }
}

export function gerarSenhaTemporaria(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  let senha = ""
  for (let i = 0; i < 12; i++) {
    senha += chars[Math.floor(Math.random() * chars.length)]
  }
  return senha
}
