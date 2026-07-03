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
