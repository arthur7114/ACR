import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { validarNovoUsuario, validarPerfilUsuario } from "@/lib/server/admin-usuarios"

export async function GET() {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  const usuarios = data.users.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    criado_em: u.created_at,
    ultimo_acesso: u.last_sign_in_at ?? null,
    role: u.app_metadata?.role ?? "visualizador",
  }))
  return NextResponse.json({ usuarios })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; role?: unknown }
    const { email, senha, role } = validarNovoUsuario({ email: body?.email, senha: undefined, role: body?.role })
    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      app_metadata: { role },
    })
    if (error) throw error
    return NextResponse.json({ usuario: { id: data.user.id, email: data.user.email, role }, senha_temporaria: senha })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar usuario." },
      { status: 400 },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: unknown; role?: unknown }
    if (typeof body.id !== "string" || !body.id) throw new Error("Usuario invalido.")
    const role = validarPerfilUsuario(body.role)
    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase.auth.admin.updateUserById(body.id, {
      app_metadata: { role },
    })
    if (error) throw error
    return NextResponse.json({ usuario: { id: data.user.id, email: data.user.email, role } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao alterar perfil." },
      { status: 400 },
    )
  }
}
