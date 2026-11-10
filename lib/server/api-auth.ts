import { NextResponse } from "next/server"
import { hasExplicitRole, hasRole, type UserRole } from "@/lib/authz"
import { createSupabaseServerClient } from "@/lib/supabase/server"

// Segunda barreira de autorizacao: cada rota confere sessao e perfil por conta
// propria, alem do middleware. Retorna a resposta de erro, ou null se liberado.
export async function requireApiRole(minimum: UserRole): Promise<NextResponse | null> {
  let role: unknown
  try {
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) {
      return NextResponse.json({ error: "Autenticacao obrigatoria." }, { status: 401 })
    }
    role = data.user.app_metadata?.role
  } catch {
    return NextResponse.json({ error: "Autenticacao obrigatoria." }, { status: 401 })
  }

  if (!hasExplicitRole(role)) {
    return NextResponse.json({ error: "Conta sem perfil de acesso." }, { status: 403 })
  }
  if (!hasRole(role, minimum)) {
    return NextResponse.json({ error: `Permissao insuficiente. Perfil minimo: ${minimum}.` }, { status: 403 })
  }
  return null
}
