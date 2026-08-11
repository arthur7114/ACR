import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { requireEnv, requireSupabasePublicKey } from "@/lib/server/env"
import { authorizeRequest, parseUserRole } from "@/lib/authz"

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const isLoginRoute = request.nextUrl.pathname.startsWith("/login")

  let user = null
  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    user = authUser
  } catch {
    // Falha ao contatar o Supabase Auth (ex.: instabilidade de rede):
    // trata como "sem usuário" para redirecionar ao /login em vez de 500.
    user = null
  }

  if (!user && !isLoginRoute) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Autenticacao obrigatoria." }, { status: 401 })
    }
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (user && isLoginRoute) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  if (user) {
    const role = parseUserRole(user.app_metadata?.role)
    const authorization = authorizeRequest(role, request.method, request.nextUrl.pathname)
    if (!authorization.allowed) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: `Permissao insuficiente. Perfil minimo: ${authorization.minimumRole}.` },
          { status: 403 },
        )
      }
      return NextResponse.redirect(new URL("/", request.url))
    }
    response.headers.set("x-acr-user-role", role)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
