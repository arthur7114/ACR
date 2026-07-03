import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { validarNovoUsuario } from "@/lib/server/admin-usuarios"

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
  }))
  return NextResponse.json({ usuarios })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown }
    const { email, senha } = validarNovoUsuario({ email: body?.email, senha: undefined })
    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })
    if (error) throw error
    return NextResponse.json({ usuario: { id: data.user.id, email: data.user.email }, senha_temporaria: senha })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar usuario." },
      { status: 400 },
    )
  }
}
