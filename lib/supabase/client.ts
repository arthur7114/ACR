import { createBrowserClient } from "@supabase/ssr"
import { requireEnv } from "@/lib/server/env"

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  )
}
