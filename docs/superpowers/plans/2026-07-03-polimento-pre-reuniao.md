# Polimento Pré-Reunião Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o sistema ACR pronto para uma reunião de apresentação: login real, tela de logs, gestão de usuários e prévia eGestor editável em Configurações, e polimento visual do Dashboard (Indicadores) e de Imóveis.

**Architecture:** Seis fases sequenciais (0 a 5) que espelham as camadas do spec. Fase 0 cria a base visual compartilhada; Fase 1 adiciona autenticação real via Supabase Auth (pré-requisito da Fase 2); Fases 2 e 3 constroem telas novas (Usuários, Logs) e estendem a prévia eGestor; Fases 4 e 5 aplicam a base visual da Fase 0 às telas de Indicadores e Imóveis, que já são funcionalmente completas.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, `@supabase/supabase-js` + `@supabase/ssr` (novo), Supabase Postgres/Auth, `node:test` via `tsx` para lógica pura server-side.

## Global Constraints

- Paleta de cores fixa: usar somente os tokens `--acr-*` já definidos em `app/globals.css:41-64` (aprovados no mock contract). Não introduzir cores novas.
- Este projeto não tem testes de UI/componente (sem jest/testing-library). Mudanças visuais (JSX/CSS) são verificadas com `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` e checagem manual no navegador — não escrever testes para JSX.
- Lógica pura server-side usa `node:test`, rodado com `pnpm dlx tsx --test <arquivo>.test.ts` (convenção já usada em `lib/server/egestor.test.ts`, `lib/server/package-rechecks.test.ts`).
- Qualquer alteração de schema Supabase exige migration SQL nova em `supabase/migrations/` (regra do `CLAUDE.md`). Este plano não altera nenhuma tabela existente — todas as fases usam tabelas já existentes.
- Node >= 20, `pnpm` como gerenciador de pacotes.
- Ao final de todas as fases, atualizar `docs/12-execution-roadmap.md` (regra do `CLAUDE.md`).

---

## Fase 0 — Sistema visual (base)

### Task 1: Componentes compartilhados de estado (vazio/erro) e classe de card padrão

**Files:**
- Modify: `app/globals.css` (adiciona classes em `@layer components`, após o bloco `.acr-heat-*` que termina em `app/globals.css:199`)
- Create: `components/acr/ui/empty-state.tsx`
- Create: `components/acr/ui/error-state.tsx`

**Interfaces:**
- Produces: `EmptyState({ title, description, icon? }: { title: string; description?: string; icon?: React.ReactNode })` — componente React, sem estado.
- Produces: `ErrorState({ title, description, onRetry? }: { title: string; description?: string; onRetry?: () => void })` — componente React, sem estado.
- Produces: classes CSS `.acr-card` e `.acr-card-hover` em `app/globals.css`, consumidas pelas Fases 4 e 5.

- [ ] **Step 1: Adicionar classes de card compartilhadas no CSS**

Em `app/globals.css`, dentro do bloco `@layer components { ... }` que já existe (linhas 170-200), adicionar ao final, antes do fechamento da chave:

```css
  /* Card padrao ACR: sombra sutil + borda + radius consistentes (polimento pre-reuniao). */
  .acr-card {
    background: white;
    border: 1px solid var(--acr-line);
    border-radius: var(--radius-lg);
    box-shadow: 0 1px 2px rgba(26, 43, 28, 0.04);
  }
  .acr-card-hover {
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
  }
  .acr-card-hover:hover {
    box-shadow: 0 2px 8px rgba(26, 43, 28, 0.08);
    border-color: var(--acr-line-2);
  }
```

- [ ] **Step 2: Criar o componente `EmptyState`**

Criar `components/acr/ui/empty-state.tsx`:

```tsx
import type { ReactNode } from "react"

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string
  description?: string
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#E2E8E3] bg-[#FAFBFA] px-6 py-10 text-center">
      {icon && <div className="text-[#9AA79B]">{icon}</div>}
      <p className="text-[13.5px] font-medium text-[#3D4F3F]">{title}</p>
      {description && <p className="max-w-sm text-[12.5px] text-[#6B7F6E]">{description}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Criar o componente `ErrorState`**

Criar `components/acr/ui/error-state.tsx`:

```tsx
import { AlertTriangle } from "lucide-react"

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-6 py-10 text-center">
      <AlertTriangle size={20} className="text-[#991B1B]" />
      <p className="text-[13.5px] font-medium text-[#991B1B]">{title}</p>
      {description && <p className="max-w-sm text-[12.5px] text-[#B45858]">{description}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-md border border-[#FCA5A5] bg-white px-3 py-1.5 text-[12px] font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verificar tipos e lint**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos relacionados aos arquivos criados.

Run: `pnpm lint`
Expected: sem erros nos arquivos criados/modificados.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css components/acr/ui/empty-state.tsx components/acr/ui/error-state.tsx
git commit -m "feat(ui): adiciona EmptyState/ErrorState e classe .acr-card compartilhada"
```

---

## Fase 1 — Login real (Supabase Auth)

### Task 2: Dependência e variáveis de ambiente

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: dependência `@supabase/ssr` disponível para as Tasks 3-6.
- Produces: variável de ambiente `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

- [ ] **Step 1: Instalar `@supabase/ssr`**

Run: `pnpm add @supabase/ssr`
Expected: `package.json` ganha `"@supabase/ssr": "^<versao>"` em `dependencies`.

- [ ] **Step 2: Documentar a nova env var**

Em `.env.example`, logo após a linha `SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...` (linha 3), adicionar:

```
# Chave publica (anon) - usada pelo cliente browser do Supabase Auth. Nao da
# acesso a dados protegidos por RLS; e segura para expor no frontend.
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

- [ ] **Step 3: Adicionar a env var real no `.env.local` (não versionado)**

Pegar o valor em Supabase Dashboard > Project Settings > API > `anon public` e adicionar em `.env.local`:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY=<valor real do projeto>
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "chore(auth): adiciona @supabase/ssr e NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

### Task 3: Clientes Supabase (browser e server)

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`

**Interfaces:**
- Consumes: `requireEnv` de `lib/server/env.ts` (`requireEnv(name: string): string`).
- Produces: `createSupabaseBrowserClient(): SupabaseClient` em `lib/supabase/client.ts` — usado pela Task 5 (tela de login) e pela Task 6 (logout na sidebar).
- Produces: `createSupabaseServerClient(): Promise<SupabaseClient>` em `lib/supabase/server.ts` — usado pela Task 4 (middleware).

- [ ] **Step 1: Criar o cliente browser**

Criar `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr"
import { requireEnv } from "@/lib/server/env"

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  )
}
```

- [ ] **Step 2: Criar o cliente server (com cookies)**

Criar `lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { requireEnv } from "@/lib/server/env"

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Chamado a partir de um Server Component sem permissao de escrita;
            // o middleware ja cuida de renovar a sessao nesse caso.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/client.ts lib/supabase/server.ts
git commit -m "feat(auth): adiciona clientes Supabase browser e server"
```

### Task 4: Middleware de proteção de rotas

**Files:**
- Create: `middleware.ts` (raiz do projeto)

**Interfaces:**
- Consumes: `requireEnv` de `lib/server/env.ts`.
- Produces: redirecionamento automático para `/login` em qualquer rota não autenticada, aplicado a todas as rotas exceto `/login` e assets estáticos.

- [ ] **Step 1: Criar `middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { requireEnv } from "@/lib/server/env"

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginRoute = request.nextUrl.pathname.startsWith("/login")

  if (!user && !isLoginRoute) {
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (user && isLoginRoute) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Verificação manual — bloqueio sem sessão**

Run: `pnpm dev`, abrir `http://localhost:3000/fechamentos` em uma aba anônima (sem cookie de sessão).
Expected: redirecionamento automático para `http://localhost:3000/login`.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts
git commit -m "feat(auth): adiciona middleware de protecao de rotas"
```

### Task 5: Tela de login

**Files:**
- Create: `app/login/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseBrowserClient` de `lib/supabase/client.ts`.
- Produces: rota `/login` funcional, chamando `supabase.auth.signInWithPassword({ email, password })` e redirecionando para `/` em caso de sucesso.

- [ ] **Step 1: Criar a página de login**

Criar `app/login/page.tsx`:

```tsx
"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) {
      setError("E-mail ou senha invalidos.")
      return
    }
    router.replace("/")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAF8] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#EEF1EE] bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2D8C3A] text-[13px] font-bold text-white">
            AC
          </div>
          <span className="text-[15px] font-bold tracking-tight text-[#1A2B1C]">ACR</span>
        </div>
        <h1 className="text-[18px] font-bold tracking-tight text-[#1A2B1C]">Entrar</h1>
        <p className="mt-1 text-[13px] text-[#6B7F6E]">Acesse com seu e-mail e senha.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#3D4F3F]">E-mail</span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-lg border border-[#D5DDD6] px-3 text-[14px] focus:border-[#2D8C3A] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#3D4F3F]">Senha</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 rounded-lg border border-[#D5DDD6] px-3 text-[14px] focus:border-[#2D8C3A] focus:outline-none"
            />
          </label>

          {error && <p className="text-[13px] text-[#C0432F]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#2D8C3A] text-[14px] font-semibold text-white hover:bg-[#1A5C24] disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Criar o primeiro usuário de teste no Supabase**

No Supabase Dashboard > Authentication > Users > "Add user", criar um usuário com e-mail e senha conhecidos para teste manual (ex.: `demo@acr.local`).

- [ ] **Step 3: Verificação manual — login funcional**

Run: `pnpm dev`, abrir `http://localhost:3000/login`, entrar com o usuário criado no Step 2.
Expected: redirecionamento para `/` (que por sua vez redireciona para `/fechamentos`), sidebar carrega normalmente.

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat(auth): adiciona tela de login"
```

### Task 6: Sidebar e Topbar com sessão real

**Files:**
- Modify: `components/acr/sidebar.tsx:88-94`
- Modify: `components/acr/topbar.tsx:150`

**Interfaces:**
- Consumes: `createSupabaseBrowserClient` de `lib/supabase/client.ts`.
- Produces: sidebar exibe e-mail do usuário logado e um botão "Sair"; topbar não tem mais placeholder de usuário duplicado.

- [ ] **Step 1: Ler a sessão e adicionar logout na Sidebar**

Em `components/acr/sidebar.tsx`, adicionar os imports no topo:

```tsx
import { useEffect, useState } from "react"
import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
```

Substituir o bloco final (linhas 88-94, o `<div className="border-t border-white/10 ...">`) por:

```tsx
        <UserFooter />
      </div>
    </aside>
  )
}

function UserFooter() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [])

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.replace("/login")
    router.refresh()
  }

  return (
    <div className="border-t border-white/10 pt-3 px-1 flex items-center gap-2.5">
      <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white text-[12px] font-semibold">
        {email ? email[0]!.toUpperCase() : "?"}
      </div>
      <div className="flex flex-col leading-tight min-w-0 flex-1">
        <span className="text-white text-[13px] font-medium truncate">{email ?? "Carregando..."}</span>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1 text-white/50 text-[11px] hover:text-white/80"
        >
          <LogOut size={11} />
          Sair
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Remover o placeholder duplicado da Topbar**

Em `components/acr/topbar.tsx:150`, remover a linha:

```tsx
        <div className="h-8 w-8 rounded-full bg-[#DDEEE1]" aria-label="Usuário não carregado" />
```

(a `<div className="flex items-center gap-4">` que a envolvia passa a conter só o sino de notificações).

- [ ] **Step 3: Verificar tipos e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Verificação manual — logout funcional**

Com a sessão do Task 5 ativa, clicar em "Sair" na sidebar.
Expected: redireciona para `/login`; tentar acessar `/fechamentos` diretamente redireciona de volta para `/login` (middleware da Task 4 em ação).

- [ ] **Step 5: Commit**

```bash
git add components/acr/sidebar.tsx components/acr/topbar.tsx
git commit -m "feat(auth): sidebar mostra usuario real e logout; remove placeholder da topbar"
```

---

## Fase 2 — Configurações: Usuários + eGestor

### Task 7: Lógica pura de validação de novo usuário

**Files:**
- Create: `lib/server/admin-usuarios.ts`
- Test: `lib/server/admin-usuarios.test.ts`

**Interfaces:**
- Produces: `validarNovoUsuario(input: { email: unknown; senha: unknown }): { email: string; senha: string }` — lança `Error` com mensagem amigável se inválido; usado pela Task 8.
- Produces: `gerarSenhaTemporaria(): string` — gera uma senha temporária de 12 caracteres alfanuméricos; usado pela Task 8.

- [ ] **Step 1: Escrever o teste que falha**

Criar `lib/server/admin-usuarios.test.ts`:

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { validarNovoUsuario, gerarSenhaTemporaria } from "./admin-usuarios.ts"

test("valida email e usa senha temporaria quando senha nao informada", () => {
  const result = validarNovoUsuario({ email: "novo@acr.com", senha: undefined })
  assert.equal(result.email, "novo@acr.com")
  assert.equal(result.senha.length >= 10, true)
})

test("rejeita email vazio", () => {
  assert.throws(() => validarNovoUsuario({ email: "", senha: undefined }), /e-mail/i)
})

test("rejeita email sem @", () => {
  assert.throws(() => validarNovoUsuario({ email: "sem-arroba.com", senha: undefined }), /e-mail/i)
})

test("gerarSenhaTemporaria gera senhas diferentes a cada chamada", () => {
  const a = gerarSenhaTemporaria()
  const b = gerarSenhaTemporaria()
  assert.equal(a.length, 12)
  assert.notEqual(a, b)
})
```

- [ ] **Step 2: Rodar o teste e confirmar falha**

Run: `pnpm dlx tsx --test lib/server/admin-usuarios.test.ts`
Expected: FAIL — `Cannot find module './admin-usuarios.ts'`.

- [ ] **Step 3: Implementar `lib/server/admin-usuarios.ts`**

```ts
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
```

- [ ] **Step 4: Rodar o teste e confirmar sucesso**

Run: `pnpm dlx tsx --test lib/server/admin-usuarios.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add lib/server/admin-usuarios.ts lib/server/admin-usuarios.test.ts
git commit -m "feat(admin): validacao de novo usuario e geracao de senha temporaria"
```

### Task 8: Endpoints de administração de usuários

**Files:**
- Create: `app/api/admin/usuarios/route.ts`

**Interfaces:**
- Consumes: `createSupabaseAdmin` de `lib/server/supabase.ts`; `validarNovoUsuario` de `lib/server/admin-usuarios.ts`.
- Produces: `GET /api/admin/usuarios` → `{ usuarios: { id: string; email: string; criado_em: string; ultimo_acesso: string | null }[] }`; `POST /api/admin/usuarios` (body `{ email: string }`) → `{ usuario: { id, email }, senha_temporaria: string }`.

- [ ] **Step 1: Implementar a rota**

Criar `app/api/admin/usuarios/route.ts`:

```ts
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
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Verificação manual**

Com o servidor rodando e uma sessão de admin ativa, `curl -X POST http://localhost:3000/api/admin/usuarios -H "Content-Type: application/json" -d '{"email":"teste2@acr.local"}'` (usando os cookies de sessão do navegador, ou testar direto pela UI da Task 9).
Expected: resposta `200` com `usuario.email == "teste2@acr.local"` e uma `senha_temporaria` de 12 caracteres; o novo usuário aparece em Supabase Dashboard > Authentication > Users.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/usuarios/route.ts
git commit -m "feat(admin): endpoints GET/POST /api/admin/usuarios"
```

### Task 9: Aba "Usuários" em Configurações

**Files:**
- Modify: `components/acr/views/configuracoes-view.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/usuarios`, `POST /api/admin/usuarios` (Task 8).
- Produces: nova navegação por abas na tela de Configurações — o conteúdo eGestor existente passa a viver sob a aba "Integração eGestor".

- [ ] **Step 1: Adicionar estado de aba e função `TabButton` local**

No topo de `components/acr/views/configuracoes-view.tsx`, junto aos outros imports, adicionar:

```tsx
import { Users } from "lucide-react"
```

Dentro do componente principal da view (onde já existem os outros `useState`), adicionar:

```tsx
const [tab, setTab] = useState<"egestor" | "usuarios">("egestor")
```

Antes do `export default function` (ou ao final do arquivo, junto de outros helpers locais), adicionar:

```tsx
function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Users; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-11 items-center gap-2 border-b-2 px-4 text-[14px] font-medium transition-colors ${
        active ? "border-[#2D8C3A] text-[#1A2B1C]" : "border-transparent text-[#6B7F6E] hover:text-[#3D4F3F]"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}
```

- [ ] **Step 2: Envolver o conteúdo existente com as abas**

No JSX retornado pelo componente principal, logo após o título da página e antes do conteúdo eGestor atual, adicionar a barra de abas:

```tsx
<div className="mb-5 flex border-b border-[#EEF1EE]">
  <TabButton active={tab === "egestor"} icon={ShieldCheck} label="Integração eGestor" onClick={() => setTab("egestor")} />
  <TabButton active={tab === "usuarios"} icon={Users} label="Usuários" onClick={() => setTab("usuarios")} />
</div>
```

Envolver todo o JSX de conteúdo eGestor pré-existente (as seções de contas, mapeamentos, etc.) com `{tab === "egestor" && (<>...conteudo existente...</>)}`, e adicionar após ele: `{tab === "usuarios" && <UsuariosTab />}`.

- [ ] **Step 3: Implementar o componente `UsuariosTab`**

Ao final do arquivo, adicionar:

```tsx
type Usuario = { id: string; email: string; criado_em: string; ultimo_acesso: string | null }

function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<Usuario[] | "loading" | "error">("loading")
  const [novoEmail, setNovoEmail] = useState("")
  const [criando, setCriando] = useState(false)
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(() => {
    setUsuarios("loading")
    fetch("/api/admin/usuarios")
      .then((r) => r.json())
      .then((payload) => setUsuarios(payload.usuarios ?? "error"))
      .catch(() => setUsuarios("error"))
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function criarUsuario(event: React.FormEvent) {
    event.preventDefault()
    setErro(null)
    setCriando(true)
    const response = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: novoEmail }),
    })
    const payload = await response.json()
    setCriando(false)
    if (!response.ok || payload.error) {
      setErro(payload.error ?? "Erro ao criar usuario.")
      return
    }
    setSenhaGerada({ email: payload.usuario.email, senha: payload.senha_temporaria })
    setNovoEmail("")
    carregar()
  }

  return (
    <div className="acr-card p-5">
      <h2 className="text-[15px] font-semibold text-[#1A2B1C]">Usuários com acesso</h2>
      <p className="mt-1 text-[13px] text-[#6B7F6E]">Cria acesso com senha temporária — repasse manualmente para a pessoa.</p>

      <form onSubmit={criarUsuario} className="mt-4 flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#3D4F3F]">E-mail do novo usuário</span>
          <input
            type="email"
            required
            value={novoEmail}
            onChange={(e) => setNovoEmail(e.target.value)}
            className="h-9 rounded-lg border border-[#D5DDD6] px-3 text-[13px] focus:border-[#2D8C3A] focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={criando}
          className="h-9 rounded-lg bg-[#2D8C3A] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {criando ? "Criando..." : "Criar usuário"}
        </button>
      </form>

      {erro && <p className="mt-2 text-[13px] text-[#C0432F]">{erro}</p>}

      {senhaGerada && (
        <div className="mt-3 rounded-lg border border-[#BBD6BE] bg-[#EFF6F0] p-3 text-[13px] text-[#1A5C24]">
          Usuário <strong>{senhaGerada.email}</strong> criado. Senha temporária (repasse manualmente, não será mostrada de novo):{" "}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono">{senhaGerada.senha}</code>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-lg border border-[#EEF1EE]">
        {usuarios === "loading" && <p className="p-4 text-[13px] text-[#6B7F6E]">Carregando...</p>}
        {usuarios === "error" && <p className="p-4 text-[13px] text-[#C0432F]">Erro ao carregar usuários.</p>}
        {Array.isArray(usuarios) && (
          <table className="w-full text-[13px]">
            <thead className="bg-[#F8FAF8] text-[11px] uppercase tracking-wide text-[#6B7F6E]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">E-mail</th>
                <th className="px-3 py-2 text-left font-medium">Criado em</th>
                <th className="px-3 py-2 text-left font-medium">Último acesso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1EE]">
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2 text-[#1A2B1C]">{u.email}</td>
                  <td className="px-3 py-2 text-[#3D4F3F]">{new Date(u.criado_em).toLocaleDateString("pt-BR")}</td>
                  <td className="px-3 py-2 text-[#3D4F3F]">
                    {u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleDateString("pt-BR") : "Nunca"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar tipos e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 5: Verificação manual**

Run: `pnpm dev`, logar, ir em Configurações > aba Usuários, criar um usuário de teste, conferir que aparece na lista e que a senha temporária é exibida uma vez.

- [ ] **Step 6: Commit**

```bash
git add components/acr/views/configuracoes-view.tsx
git commit -m "feat(admin): aba Usuarios em Configuracoes"
```

### Task 9b: Polimento visual dos cards eGestor existentes

**Files:**
- Modify: `components/acr/views/configuracoes-view.tsx:190,223,228,365,413`

**Interfaces:**
- Consumes: classe `.acr-card` de `app/globals.css` (Fase 0, Task 1).

- [ ] **Step 1: Padronizar os wrappers de card para `.acr-card`**

Substituir cada ocorrência de `rounded-xl border border-[#EEF1EE] bg-white` (linhas 190, 223, 365) por `acr-card acr-card-hover`, e cada ocorrência de `rounded-lg border border-[#EEF1EE]` usada como wrapper de bloco/tabela (linhas 228, 413) por `acr-card overflow-hidden p-0` quando envolver uma tabela, ou `acr-card p-3` quando envolver um bloco de conteúdo simples (linha 228). Preservar todas as demais classes de layout já presentes (padding extra, margens, `overflow-x-auto`, etc.) além da troca de borda/fundo/radius.

- [ ] **Step 2: Verificar tipos e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`, abrir `/configuracoes`, aba "Integração eGestor", confirmar visualmente que os cards de conta têm sombra sutil consistente com as demais telas polidas.

- [ ] **Step 4: Commit**

```bash
git add components/acr/views/configuracoes-view.tsx
git commit -m "style(configuracoes): padroniza cards eGestor com .acr-card"
```

### Task 10: Generalizar edição de campo da prévia eGestor (lógica pura)

**Files:**
- Modify: `lib/server/egestor.ts:782-816`
- Modify: `lib/server/egestor.test.ts`

**Interfaces:**
- Produces: `buildLancamentoUpdate(atual: { descricao: string; valor: number; tags: string[]; payload: Record<string, unknown> }, mudancas: { descricao?: string; valor?: number; tags?: string[] }): { descricao: string; valor: number; tags: string[]; payload: Record<string, unknown> }` — função pura, lança `Error` em input inválido. Usada pela Task 11 (via wrapper com I/O).
- Consumes: nenhuma (função pura, sem I/O).

- [ ] **Step 1: Escrever o teste que falha**

Em `lib/server/egestor.test.ts`, adicionar ao final do arquivo:

```ts
import { buildLancamentoUpdate } from "./egestor.ts"

test("buildLancamentoUpdate atualiza descricao e sincroniza no payload", () => {
  const atual = { descricao: "Antiga", valor: 100, tags: ["ACR"], payload: { descricao: "Antiga", valor: 100 } }
  const result = buildLancamentoUpdate(atual, { descricao: "Nova descricao" })
  assert.equal(result.descricao, "Nova descricao")
  assert.equal(result.payload.descricao, "Nova descricao")
  assert.equal(result.valor, 100)
})

test("buildLancamentoUpdate atualiza valor e sincroniza no payload", () => {
  const atual = { descricao: "X", valor: 100, tags: ["ACR"], payload: { valor: 100 } }
  const result = buildLancamentoUpdate(atual, { valor: 250.5 })
  assert.equal(result.valor, 250.5)
  assert.equal(result.payload.valor, 250.5)
})

test("buildLancamentoUpdate rejeita valor nao positivo", () => {
  const atual = { descricao: "X", valor: 100, tags: ["ACR"], payload: {} }
  assert.throws(() => buildLancamentoUpdate(atual, { valor: 0 }), /valor/i)
  assert.throws(() => buildLancamentoUpdate(atual, { valor: -5 }), /valor/i)
})

test("buildLancamentoUpdate atualiza etiquetas e rejeita lista vazia", () => {
  const atual = { descricao: "X", valor: 100, tags: ["ACR"], payload: { tags: ["ACR"] } }
  const result = buildLancamentoUpdate(atual, { tags: ["ACR", "MARACANAU"] })
  assert.deepEqual(result.tags, ["ACR", "MARACANAU"])
  assert.deepEqual(result.payload.tags, ["ACR", "MARACANAU"])
  assert.throws(() => buildLancamentoUpdate(atual, { tags: [] }), /etiqueta/i)
})
```

- [ ] **Step 2: Rodar os testes e confirmar falha**

Run: `pnpm dlx tsx --test lib/server/egestor.test.ts`
Expected: FAIL — `buildLancamentoUpdate` não existe.

- [ ] **Step 3: Implementar `buildLancamentoUpdate` e generalizar `updateEgestorLancamentoDescricao`**

Em `lib/server/egestor.ts`, substituir a função `updateEgestorLancamentoDescricao` (linhas 785-816) por:

```ts
export function buildLancamentoUpdate(
  atual: { descricao: string; valor: number; tags: string[]; payload: Record<string, unknown> },
  mudancas: { descricao?: string; valor?: number; tags?: string[] },
) {
  let { descricao, valor, tags } = atual
  const payload = { ...atual.payload }

  if (mudancas.descricao !== undefined) {
    const nova = mudancas.descricao.trim()
    if (!nova) throw new Error("A descricao nao pode ficar vazia.")
    if (nova.length > 200) throw new Error("A descricao deve ter no maximo 200 caracteres.")
    descricao = nova
    payload.descricao = nova
  }

  if (mudancas.valor !== undefined) {
    if (!Number.isFinite(mudancas.valor) || mudancas.valor <= 0) {
      throw new Error("O valor deve ser um numero maior que zero.")
    }
    valor = Number(mudancas.valor.toFixed(2))
    payload.valor = valor
  }

  if (mudancas.tags !== undefined) {
    const novasTags = mudancas.tags.map((t) => t.trim()).filter(Boolean)
    if (novasTags.length === 0) throw new Error("Informe pelo menos uma etiqueta.")
    tags = novasTags
    payload.tags = novasTags
  }

  return { descricao, valor, tags, payload }
}

// Edita descricao/valor/etiquetas de um lancamento na previa, antes do envio.
// Atualiza tanto as colunas de exibicao quanto o payload (o que vai ao eGestor).
// Bloqueado apos o envio (egestor_codigo definido).
export async function updateEgestorLancamentoCampo(
  supabase: SupabaseClient,
  fechamentoId: string,
  lancamentoId: string,
  mudancas: { descricao?: string; valor?: number; tags?: string[] },
) {
  const { data: lancamento, error } = await supabase
    .from("egestor_lancamentos")
    .select("id, descricao, valor, tags, payload, egestor_codigo")
    .eq("id", lancamentoId)
    .eq("fechamento_id", fechamentoId)
    .maybeSingle()
  if (error) throw error
  if (!lancamento) throw new Error("Lancamento nao encontrado.")
  if (lancamento.egestor_codigo !== null) {
    throw new Error("Lancamento ja enviado ao eGestor; nao pode mais ser editado.")
  }

  const atualizado = buildLancamentoUpdate(
    {
      descricao: lancamento.descricao,
      valor: lancamento.valor,
      tags: lancamento.tags ?? [],
      payload: (lancamento.payload as Record<string, unknown>) ?? {},
    },
    mudancas,
  )

  const { error: updateError } = await supabase
    .from("egestor_lancamentos")
    .update(atualizado)
    .eq("id", lancamentoId)
    .eq("fechamento_id", fechamentoId)
  if (updateError) throw updateError

  return getLancamentos(supabase, fechamentoId)
}
```

- [ ] **Step 4: Rodar os testes e confirmar sucesso**

Run: `pnpm dlx tsx --test lib/server/egestor.test.ts`
Expected: PASS (10/10 — 6 testes existentes + 4 novos).

- [ ] **Step 5: Commit**

```bash
git add lib/server/egestor.ts lib/server/egestor.test.ts
git commit -m "feat(egestor): generaliza edicao de descricao/valor/etiquetas na previa"
```

### Task 11: Rota PATCH e UI editável para Valor e Etiquetas

**Files:**
- Modify: `app/api/fechamentos/[id]/egestor/lancamentos/[lancamentoId]/route.ts`
- Modify: `components/acr/views/revisao-view.tsx:671-693` (handlers) e `:1703`, `:1711` (colunas da tabela)

**Interfaces:**
- Consumes: `updateEgestorLancamentoCampo` de `lib/server/egestor.ts` (Task 10).
- Produces: `PATCH /api/fechamentos/[id]/egestor/lancamentos/[lancamentoId]` aceita agora `{ descricao?, valor?, tags? }`.

- [ ] **Step 1: Atualizar a rota PATCH**

Substituir o conteúdo de `app/api/fechamentos/[id]/egestor/lancamentos/[lancamentoId]/route.ts` por:

```ts
import { NextResponse } from "next/server"
import { updateEgestorLancamentoCampo } from "@/lib/server/egestor"
import { createSupabaseAdmin } from "@/lib/server/supabase"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; lancamentoId: string }> },
) {
  try {
    const { id, lancamentoId } = await context.params
    const body = (await request.json()) as { descricao?: unknown; valor?: unknown; tags?: unknown }
    const mudancas: { descricao?: string; valor?: number; tags?: string[] } = {}
    if (typeof body?.descricao === "string") mudancas.descricao = body.descricao
    if (typeof body?.valor === "number") mudancas.valor = body.valor
    if (Array.isArray(body?.tags)) mudancas.tags = body.tags.filter((t): t is string => typeof t === "string")

    const lancamentos = await updateEgestorLancamentoCampo(createSupabaseAdmin(), id, lancamentoId, mudancas)
    return NextResponse.json({ lancamentos })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao editar o lancamento." },
      { status: 400 },
    )
  }
}
```

- [ ] **Step 2: Generalizar os handlers de edição na `revisao-view.tsx`**

Em `components/acr/views/revisao-view.tsx`, substituir os handlers `iniciarEdicaoDescricao` e `salvarDescricaoEgestor` (linhas 671-693) por versões genéricas por campo:

```tsx
function iniciarEdicaoLancamento(campo: "descricao" | "valor" | "tags", lancamentoId: string, valorAtual: string) {
  setEgestorError(null)
  setEditandoCampo({ campo, lancamentoId })
  setValorEdicao(valorAtual)
}

async function salvarEdicaoLancamento(lancamentoId: string, campo: "descricao" | "valor" | "tags") {
  setSalvandoDescricao(true)
  setEgestorError(null)
  const body: Record<string, unknown> =
    campo === "valor"
      ? { valor: Number(valorEdicao.replace(",", ".")) }
      : campo === "tags"
        ? { tags: valorEdicao.split(",").map((t) => t.trim()).filter(Boolean) }
        : { descricao: valorEdicao }
  const response = await fetch(`/api/fechamentos/${fechamentoId}/egestor/lancamentos/${lancamentoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  setSalvandoDescricao(false)
  if (!response.ok || payload.error) {
    setEgestorError(payload.error ?? "Falha ao editar o lancamento.")
    return
  }
  setEditandoCampo(null)
  if (onRefresh) await onRefresh()
}
```

Junto aos `useState` já existentes para `editandoDescricaoId`/`descricaoEdicao`, substituir por:

```tsx
const [editandoCampo, setEditandoCampo] = useState<{ campo: "descricao" | "valor" | "tags"; lancamentoId: string } | null>(null)
const [valorEdicao, setValorEdicao] = useState("")
```

E atualizar todas as referências a `editandoDescricaoId`/`descricaoEdicao`/`setDescricaoEdicao`/`iniciarEdicaoDescricao`/`salvarDescricaoEgestor` na coluna "Descrição" (linhas 1658-1701) para usar `editandoCampo?.campo === "descricao" && editandoCampo.lancamentoId === lancamento.id`, `valorEdicao`/`setValorEdicao`, `iniciarEdicaoLancamento("descricao", ...)` e `salvarEdicaoLancamento(lancamento.id, "descricao")`.

- [ ] **Step 3: Tornar a coluna "Valor" editável**

Substituir a célula de valor (linha 1703):

```tsx
<td className="px-3 py-2 tabular-nums text-[#1A2B1C]">{formatBRL(lancamento.valor)}</td>
```

por:

```tsx
<td className="px-3 py-2 tabular-nums text-[#1A2B1C]">
  {editandoCampo?.campo === "valor" && editandoCampo.lancamentoId === lancamento.id ? (
    <div className="flex flex-col gap-1.5">
      <input
        type="text"
        inputMode="decimal"
        autoFocus
        value={valorEdicao}
        onChange={(e) => setValorEdicao(e.target.value)}
        className="w-28 rounded-md border border-[#BBD6BE] px-2 py-1 text-[13px] focus:border-[#2D8C3A] focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => salvarEdicaoLancamento(lancamento.id, "valor")} disabled={salvandoDescricao} className="rounded-md bg-[#2D8C3A] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
          {salvandoDescricao ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" onClick={() => setEditandoCampo(null)} disabled={salvandoDescricao} className="rounded-md px-2 py-1 text-[11px] font-medium text-[#6B7F6E] hover:text-[#1A2B1C]">
          Cancelar
        </button>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <span>{formatBRL(lancamento.valor)}</span>
      {lancamento.egestor_codigo == null && (
        <button type="button" onClick={() => iniciarEdicaoLancamento("valor", lancamento.id, String(lancamento.valor))} className="text-[11px] font-medium text-[#2D8C3A] underline underline-offset-2 hover:text-[#1A6B27]">
          editar
        </button>
      )}
    </div>
  )}
</td>
```

- [ ] **Step 4: Tornar a coluna "Etiquetas" editável**

Substituir a célula de etiquetas (linha 1711):

```tsx
<td className="px-3 py-2">
  {lancamento.tags.length > 0 ? (
    <div className="flex flex-wrap gap-1">
      {lancamento.tags.map((tag) => (
        <span key={tag} className="inline-flex rounded-full bg-[#EEF1EE] px-2 py-0.5 text-[11px] font-medium text-[#3D4F3F]">
          {tag}
        </span>
      ))}
    </div>
  ) : (
    <span className="text-[#6B7F6E]">-</span>
  )}
</td>
```

por:

```tsx
<td className="px-3 py-2">
  {editandoCampo?.campo === "tags" && editandoCampo.lancamentoId === lancamento.id ? (
    <div className="flex flex-col gap-1.5">
      <input
        type="text"
        autoFocus
        placeholder="ACR, MARACANAU"
        value={valorEdicao}
        onChange={(e) => setValorEdicao(e.target.value)}
        className="w-40 rounded-md border border-[#BBD6BE] px-2 py-1 text-[13px] focus:border-[#2D8C3A] focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => salvarEdicaoLancamento(lancamento.id, "tags")} disabled={salvandoDescricao} className="rounded-md bg-[#2D8C3A] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
          {salvandoDescricao ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" onClick={() => setEditandoCampo(null)} disabled={salvandoDescricao} className="rounded-md px-2 py-1 text-[11px] font-medium text-[#6B7F6E] hover:text-[#1A2B1C]">
          Cancelar
        </button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-1">
      {lancamento.tags.length > 0 ? (
        lancamento.tags.map((tag) => (
          <span key={tag} className="inline-flex rounded-full bg-[#EEF1EE] px-2 py-0.5 text-[11px] font-medium text-[#3D4F3F]">
            {tag}
          </span>
        ))
      ) : (
        <span className="text-[#6B7F6E]">-</span>
      )}
      {lancamento.egestor_codigo == null && (
        <button type="button" onClick={() => iniciarEdicaoLancamento("tags", lancamento.id, lancamento.tags.join(", "))} className="text-[11px] font-medium text-[#2D8C3A] underline underline-offset-2 hover:text-[#1A6B27]">
          editar
        </button>
      )}
    </div>
  )}
</td>
```

- [ ] **Step 5: Verificar tipos e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 6: Verificação manual**

Em um fechamento aprovado com prévia eGestor gerada e não enviada, editar Valor e Etiquetas de um lançamento, salvar, recarregar a página e confirmar que os novos valores persistem. Confirmar que, após "Enviar ao eGestor", os links "editar" somem para aquele lançamento.

- [ ] **Step 7: Commit**

```bash
git add app/api/fechamentos/[id]/egestor/lancamentos/[lancamentoId]/route.ts components/acr/views/revisao-view.tsx
git commit -m "feat(egestor): valor e etiquetas editaveis na previa eGestor"
```

---

## Fase 3 — Logs

### Task 12: Agregação pura de logs

**Files:**
- Create: `lib/server/logs.ts`
- Test: `lib/server/logs.test.ts`

**Interfaces:**
- Produces: `type LogEntry = { id: string; tipo: "correcao" | "notificacao"; titulo: string; detalhe: string; quando: string }`.
- Produces: `mesclarLogs(correcoes: { id: string; campo: string; valor_anterior: string | null; valor_novo: string; corrigido_pelo: string; motivo: string; criado_em: string }[], notificacoes: { id: string; tipo: string; titulo: string; corpo: string; criado_em: string }[]): LogEntry[]` — função pura, ordena por `quando` decrescente. Usado pela Task 13.

- [ ] **Step 1: Escrever o teste que falha**

Criar `lib/server/logs.test.ts`:

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { mesclarLogs } from "./logs.ts"

test("mescla correcoes e notificacoes ordenadas por data decrescente", () => {
  const correcoes = [
    { id: "c1", campo: "valor_repasse", valor_anterior: "100", valor_novo: "120", corrigido_pelo: "ana@acr.com", motivo: "ajuste manual", criado_em: "2026-07-01T10:00:00Z" },
  ]
  const notificacoes = [
    { id: "n1", tipo: "analise_concluida", titulo: "Análise concluída", corpo: "Fechamento X processado", criado_em: "2026-07-02T09:00:00Z" },
  ]
  const result = mesclarLogs(correcoes, notificacoes)
  assert.equal(result.length, 2)
  assert.equal(result[0].id, "n1")
  assert.equal(result[0].tipo, "notificacao")
  assert.equal(result[1].id, "c1")
  assert.equal(result[1].tipo, "correcao")
  assert.match(result[1].detalhe, /valor_repasse/)
  assert.match(result[1].detalhe, /ana@acr\.com/)
})

test("retorna lista vazia quando nao ha logs", () => {
  assert.deepEqual(mesclarLogs([], []), [])
})
```

- [ ] **Step 2: Rodar o teste e confirmar falha**

Run: `pnpm dlx tsx --test lib/server/logs.test.ts`
Expected: FAIL — `Cannot find module './logs.ts'`.

- [ ] **Step 3: Implementar `lib/server/logs.ts`**

```ts
export type LogEntry = {
  id: string
  tipo: "correcao" | "notificacao"
  titulo: string
  detalhe: string
  quando: string
}

type CorrecaoRow = {
  id: string
  campo: string
  valor_anterior: string | null
  valor_novo: string
  corrigido_pelo: string
  motivo: string
  criado_em: string
}

type NotificacaoRow = {
  id: string
  tipo: string
  titulo: string
  corpo: string
  criado_em: string
}

export function mesclarLogs(correcoes: CorrecaoRow[], notificacoes: NotificacaoRow[]): LogEntry[] {
  const deCorrecoes: LogEntry[] = correcoes.map((c) => ({
    id: c.id,
    tipo: "correcao",
    titulo: `Correção manual: ${c.campo}`,
    detalhe: `${c.valor_anterior ?? "-"} → ${c.valor_novo} · por ${c.corrigido_pelo} · motivo: ${c.motivo}`,
    quando: c.criado_em,
  }))
  const deNotificacoes: LogEntry[] = notificacoes.map((n) => ({
    id: n.id,
    tipo: "notificacao",
    titulo: n.titulo,
    detalhe: n.corpo,
    quando: n.criado_em,
  }))
  return [...deCorrecoes, ...deNotificacoes].sort((a, b) => (a.quando < b.quando ? 1 : -1))
}
```

- [ ] **Step 4: Rodar o teste e confirmar sucesso**

Run: `pnpm dlx tsx --test lib/server/logs.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add lib/server/logs.ts lib/server/logs.test.ts
git commit -m "feat(logs): funcao pura de mesclagem de correcoes e notificacoes"
```

### Task 13: Endpoint de logs

**Files:**
- Create: `app/api/logs/route.ts`

**Interfaces:**
- Consumes: `mesclarLogs` de `lib/server/logs.ts`; `createSupabaseAdmin` de `lib/server/supabase.ts`.
- Produces: `GET /api/logs` → `{ logs: LogEntry[] }`.

- [ ] **Step 1: Implementar a rota**

Criar `app/api/logs/route.ts`:

```ts
import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/server/supabase"
import { mesclarLogs } from "@/lib/server/logs"

export async function GET() {
  const supabase = createSupabaseAdmin()

  const [{ data: correcoes, error: correcoesError }, { data: notificacoes, error: notificacoesError }] =
    await Promise.all([
      supabase
        .from("auditoria_correcoes")
        .select("id, campo, valor_anterior, valor_novo, corrigido_pelo, motivo, criado_em")
        .order("criado_em", { ascending: false })
        .limit(200),
      supabase
        .from("notificacoes")
        .select("id, tipo, titulo, corpo, criado_em")
        .order("criado_em", { ascending: false })
        .limit(200),
    ])

  if (correcoesError) return NextResponse.json({ error: correcoesError.message }, { status: 400 })
  if (notificacoesError) return NextResponse.json({ error: notificacoesError.message }, { status: 400 })

  const logs = mesclarLogs(correcoes ?? [], notificacoes ?? [])
  return NextResponse.json({ logs })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add app/api/logs/route.ts
git commit -m "feat(logs): endpoint GET /api/logs"
```

### Task 14: Tela de Logs e navegação

**Files:**
- Create: `components/acr/views/logs-view.tsx`
- Create: `app/(app)/logs/page.tsx`
- Modify: `components/acr/sidebar.tsx:14-33`
- Modify: `components/acr/topbar.tsx:73-82` (crumbs)

**Interfaces:**
- Consumes: `GET /api/logs` (Task 13); `EmptyState`/`ErrorState` de `components/acr/ui/*` (Fase 0).
- Produces: rota `/logs` navegável a partir da sidebar.

- [ ] **Step 1: Criar `logs-view.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"
import { EmptyState } from "@/components/acr/ui/empty-state"
import { ErrorState } from "@/components/acr/ui/error-state"
import { History } from "lucide-react"

type LogEntry = {
  id: string
  tipo: "correcao" | "notificacao"
  titulo: string
  detalhe: string
  quando: string
}

export function LogsView() {
  const [logs, setLogs] = useState<LogEntry[] | "loading" | "error">("loading")

  useEffect(() => {
    fetch("/api/logs")
      .then((r) => r.json())
      .then((payload) => setLogs(payload.logs ?? "error"))
      .catch(() => setLogs("error"))
  }, [])

  return (
    <div>
      <h1 className="text-[20px] font-bold tracking-tight text-[#1A2B1C]">Logs</h1>
      <p className="mt-1 text-[13px] text-[#6B7F6E]">Correções manuais e eventos do sistema.</p>

      <div className="acr-card mt-5 overflow-hidden p-0">
        {logs === "loading" && <p className="p-6 text-[13px] text-[#6B7F6E]">Carregando...</p>}
        {logs === "error" && <ErrorState title="Não foi possível carregar os logs." />}
        {Array.isArray(logs) && logs.length === 0 && (
          <EmptyState icon={<History size={22} />} title="Nenhum registro ainda" description="Correções manuais e eventos do sistema vão aparecer aqui." />
        )}
        {Array.isArray(logs) && logs.length > 0 && (
          <table className="w-full text-[13px]">
            <thead className="bg-[#F8FAF8] text-[11px] uppercase tracking-wide text-[#6B7F6E]">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                <th className="px-4 py-2.5 text-left font-medium">Título</th>
                <th className="px-4 py-2.5 text-left font-medium">Detalhe</th>
                <th className="px-4 py-2.5 text-left font-medium">Quando</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1EE]">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        log.tipo === "correcao" ? "bg-[#FBF3E4] text-[#92400E]" : "bg-[#EFF6F0] text-[#1A5C24]"
                      }`}
                    >
                      {log.tipo === "correcao" ? "Correção" : "Notificação"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-[#1A2B1C]">{log.titulo}</td>
                  <td className="px-4 py-2.5 text-[#3D4F3F]">{log.detalhe}</td>
                  <td className="px-4 py-2.5 text-[#6B7F6E]">{new Date(log.quando).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Criar a página da rota**

Criar `app/(app)/logs/page.tsx`:

```tsx
import { LogsView } from "@/components/acr/views/logs-view"

export default function LogsPage() {
  return <LogsView />
}
```

- [ ] **Step 3: Adicionar item na Sidebar**

Em `components/acr/sidebar.tsx`, importar `History` junto aos outros ícones (linha 5) e adicionar ao array `mainItems` (após o item "Indicadores", linhas 27-32):

```tsx
  {
    href: "/logs",
    label: "Logs",
    icon: History,
    matches: (pathname) => pathname.startsWith("/logs"),
  },
```

- [ ] **Step 4: Adicionar breadcrumb na Topbar**

Em `components/acr/topbar.tsx`, na função `buildCrumbs` (linhas 52-83), adicionar antes do `return [{ label: "Fechamentos" }]` final:

```tsx
  if (pathname.startsWith("/logs")) {
    return [{ label: "Logs" }]
  }
```

- [ ] **Step 5: Verificar tipos e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 6: Verificação manual**

Run: `pnpm dev`, logar, clicar em "Logs" na sidebar, confirmar que a tabela carrega (ou o estado vazio, se não houver dados ainda) e que o breadcrumb mostra "Logs".

- [ ] **Step 7: Commit**

```bash
git add components/acr/views/logs-view.tsx "app/(app)/logs/page.tsx" components/acr/sidebar.tsx components/acr/topbar.tsx
git commit -m "feat(logs): tela de logs e navegacao"
```

---

## Fase 4 — Dashboard (Indicadores): polimento visual

### Task 15: Refinar primitivos compartilhados de Indicadores

**Files:**
- Modify: `components/acr/indicadores/primitives/chart-card.tsx`
- Modify: `components/acr/indicadores/primitives/kpi-card.tsx`

**Interfaces:**
- Consumes: classe `.acr-card`/`.acr-card-hover` de `app/globals.css` (Fase 0, Task 1).
- Produces: nenhuma mudança de assinatura — só de classes CSS aplicadas, então todas as 4 sub-abas de Indicadores (que já consomem `Card`/`KpiCard`) ganham o visual refinado automaticamente.

- [ ] **Step 1: Aplicar `.acr-card` no componente `Card`**

Em `components/acr/indicadores/primitives/chart-card.tsx`, trocar:

```tsx
    <div className={cn("rounded-2xl border border-acr-line bg-white p-5", className)}>{children}</div>
```

por:

```tsx
    <div className={cn("acr-card acr-card-hover p-5", className)}>{children}</div>
```

- [ ] **Step 2: Aplicar `.acr-card` no componente `KpiCard`**

Em `components/acr/indicadores/primitives/kpi-card.tsx`, trocar:

```tsx
    <div className="flex flex-col rounded-2xl border border-acr-line bg-white p-5">
```

por:

```tsx
    <div className="acr-card acr-card-hover flex flex-col p-5">
```

- [ ] **Step 3: Verificar tipos e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Verificação manual**

Run: `pnpm dev`, abrir `/indicadores`, navegar pelas 4 sub-abas (Visão Geral, Receita, Mapa de Calor, Registro) e confirmar visualmente que os cards têm sombra sutil e destacam levemente no hover, sem quebra de layout.

- [ ] **Step 5: Commit**

```bash
git add components/acr/indicadores/primitives/chart-card.tsx components/acr/indicadores/primitives/kpi-card.tsx
git commit -m "style(indicadores): aplica card padrao com sombra sutil nos primitivos compartilhados"
```

---

## Fase 5 — Imóveis: polimento visual

### Task 16: Refinar wrappers de tabela e cards em Imóveis

**Files:**
- Modify: `components/acr/views/imoveis-view.tsx`

**Interfaces:**
- Consumes: classe `.acr-card`/`.acr-card-hover` de `app/globals.css` (Fase 0, Task 1).

- [ ] **Step 1: Localizar wrappers de tabela/card existentes**

Run: `grep -n "rounded-lg border\|rounded-xl border" components/acr/views/imoveis-view.tsx`
Expected: lista de linhas com wrappers do tipo `className="... rounded-lg border border-[#EEF1EE] ..."` ou similar, usados para envolver cada tabela (Imóveis, Imobiliárias, Empreendimentos, Regras).

- [ ] **Step 2: Padronizar os wrappers para `.acr-card`**

Para cada wrapper encontrado no Step 1 que envolve uma tabela ou bloco de conteúdo principal (não os `TabButton` nem inputs), substituir a combinação `rounded-lg border border-[#EEF1EE] bg-white` (ou variação equivalente já usada) por `acr-card overflow-hidden p-0`, preservando quaisquer outras classes de layout (`overflow-x-auto`, margens, etc.) já presentes.

- [ ] **Step 3: Verificar tipos e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Verificação manual**

Run: `pnpm dev`, abrir `/imoveis`, navegar pelas 4 abas e confirmar visualmente consistência de sombra/borda com as demais telas já polidas (Indicadores, Logs).

- [ ] **Step 5: Commit**

```bash
git add components/acr/views/imoveis-view.tsx
git commit -m "style(imoveis): padroniza cards e tabelas com .acr-card"
```

### Task 17: Refinar o drawer de histórico do imóvel

**Files:**
- Modify: `components/acr/views/imovel-historico-drawer.tsx`

**Interfaces:**
- Consumes: classe `.acr-card` de `app/globals.css` (Fase 0, Task 1).

- [ ] **Step 1: Localizar blocos de resumo/timeline**

Run: `grep -n "rounded-lg\|rounded-xl" components/acr/views/imovel-historico-drawer.tsx`
Expected: lista de blocos de resumo (contadores de meses pagos/inadimplentes/vagos) e da timeline de eventos.

- [ ] **Step 2: Aplicar `.acr-card` nos blocos de resumo**

Nos blocos de resumo identificados no Step 1 (cards de contagem, não os itens individuais da timeline), substituir a classe de borda/fundo existente por `acr-card p-4`, preservando classes de grid/flex já presentes.

- [ ] **Step 3: Verificar tipos e lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Verificação manual**

Run: `pnpm dev`, abrir `/imoveis`, clicar em um imóvel para abrir o drawer de histórico, confirmar visualmente que os cards de resumo têm o mesmo tratamento visual das demais telas.

- [ ] **Step 5: Commit**

```bash
git add components/acr/views/imovel-historico-drawer.tsx
git commit -m "style(imoveis): padroniza cards de resumo do drawer de historico"
```

---

## Fase Final — Documentação

### Task 18: Atualizar o roadmap de execução

**Files:**
- Modify: `docs/12-execution-roadmap.md`

**Interfaces:** nenhuma (documentação).

- [ ] **Step 1: Adicionar entrada ao roadmap**

Ao final de `docs/12-execution-roadmap.md`, seguindo o formato já usado nas entradas anteriores (Outcome entregue / Validação / Arquivos impactados), adicionar uma entrada cobrindo: login real via Supabase Auth + middleware, aba Usuários em Configurações, edição de Valor/Etiquetas na prévia eGestor, tela de Logs, e polimento visual de Indicadores e Imóveis via `.acr-card`/`EmptyState`/`ErrorState`. Listar todos os arquivos criados/modificados nas Tasks 1-17.

- [ ] **Step 2: Rodar a suíte completa de testes de lógica**

Run: `pnpm dlx tsx --test lib/server/*.test.ts lib/*.test.ts`
Expected: todos os testes passam (suíte anterior + `admin-usuarios.test.ts` + `logs.test.ts` + os 4 novos casos em `egestor.test.ts`).

- [ ] **Step 3: Rodar os gates finais do projeto**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: todos passam sem erro.

- [ ] **Step 4: Commit**

```bash
git add docs/12-execution-roadmap.md
git commit -m "docs(roadmap): registra polimento pre-reuniao (login, logs, usuarios, dashboard, imoveis)"
```
