export const USER_ROLES = ["visualizador", "operador", "aprovador", "admin"] as const

export type UserRole = (typeof USER_ROLES)[number]

const roleLevel: Record<UserRole, number> = {
  visualizador: 0,
  operador: 1,
  aprovador: 2,
  admin: 3,
}

export function parseUserRole(value: unknown): UserRole {
  return USER_ROLES.includes(value as UserRole) ? (value as UserRole) : "visualizador"
}

export function hasRole(role: UserRole, minimum: UserRole): boolean {
  return roleLevel[role] >= roleLevel[minimum]
}

export function authorizeRequest(role: UserRole, method: string, pathname: string) {
  const normalizedMethod = method.toUpperCase()
  const isRead = normalizedMethod === "GET" || normalizedMethod === "HEAD" || normalizedMethod === "OPTIONS"

  if (pathname.startsWith("/api/admin/") || pathname === "/api/egestor/config") {
    return { allowed: role === "admin", minimumRole: "admin" as const }
  }

  if (pathname.endsWith("/aprovar")) {
    return { allowed: hasRole(role, "aprovador"), minimumRole: "aprovador" as const }
  }

  if (pathname === "/api/notificacoes/marcar-lidas") {
    return { allowed: true, minimumRole: "visualizador" as const }
  }

  if (isRead || !pathname.startsWith("/api/")) {
    return { allowed: true, minimumRole: "visualizador" as const }
  }

  return { allowed: hasRole(role, "operador"), minimumRole: "operador" as const }
}
