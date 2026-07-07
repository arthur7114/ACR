import { createBrowserClient } from "@supabase/ssr"
import { requireEnv, requireSupabasePublicKey } from "@/lib/server/env"

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireSupabasePublicKey(),
  )
}
