import { createBrowserClient } from "@supabase/ssr"

// Acesso estatico (process.env.NEXT_PUBLIC_X), nao via requireEnv(name): este
// arquivo roda no browser, e o Next.js so consegue inlinear NEXT_PUBLIC_* no
// bundle do cliente quando a leitura e literal - acesso dinamico (process.env[name])
// fica undefined no browser mesmo com a variavel definida no .env.local.
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL")
  if (!anonKey) throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY")
  return createBrowserClient(url, anonKey)
}
