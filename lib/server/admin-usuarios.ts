import { randomInt } from "node:crypto"
import { USER_ROLES, type UserRole } from "@/lib/authz"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validarNovoUsuario(input: { email: unknown; senha: unknown; role?: unknown }) {
  const email = typeof input.email === "string" ? input.email.trim() : ""
  if (!email) throw new Error("Informe um e-mail.")
  if (!EMAIL_RE.test(email)) throw new Error("E-mail invalido.")

  const senhaInformada = typeof input.senha === "string" ? input.senha.trim() : ""
  const senha = senhaInformada.length >= 8 ? senhaInformada : gerarSenhaTemporaria()

  return { email, senha, role: validarPerfilUsuario(input.role, "operador") }
}

export function validarPerfilUsuario(value: unknown, fallback?: UserRole): UserRole {
  if (value === undefined && fallback) return fallback
  if (typeof value === "string" && USER_ROLES.includes(value as UserRole)) return value as UserRole
  throw new Error("Perfil de usuario invalido.")
}

export function gerarSenhaTemporaria(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  let senha = ""
  for (let i = 0; i < 12; i++) {
    senha += chars[randomInt(chars.length)]
  }
  return senha
}
