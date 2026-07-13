"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  Building2,
  FileText,
  History,
  LogOut,
  Menu,
  Receipt,
  Settings,
  X,
} from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

type NavItem = {
  href: string
  label: string
  icon: typeof FileText
  matches: (pathname: string) => boolean
}

type NavigationLinkProps = {
  item: NavItem
  pathname: string
  variant: "persistent" | "mobile"
  onNavigate?: () => void
}

const mainItems: NavItem[] = [
  {
    href: "/fechamentos",
    label: "Fechamentos",
    icon: FileText,
    matches: (pathname) => pathname === "/" || pathname.startsWith("/fechamentos"),
  },
  {
    href: "/imoveis",
    label: "Imóveis",
    icon: Building2,
    matches: (pathname) => pathname.startsWith("/imoveis"),
  },
  {
    href: "/iptu",
    label: "IPTU",
    icon: Receipt,
    matches: (pathname) => pathname.startsWith("/iptu"),
  },
  {
    href: "/indicadores",
    label: "Indicadores",
    icon: BarChart3,
    matches: (pathname) => pathname.startsWith("/indicadores"),
  },
  {
    href: "/logs",
    label: "Logs",
    icon: History,
    matches: (pathname) => pathname.startsWith("/logs"),
  },
]

const configItem: NavItem = {
  href: "/configuracoes",
  label: "Configurações",
  icon: Settings,
  matches: (pathname) => pathname.startsWith("/configuracoes"),
}

function NavigationLink({ item, pathname, variant, onNavigate }: NavigationLinkProps) {
  const Icon = item.icon
  const isActive = item.matches(pathname)
  const layoutClass =
    variant === "persistent"
      ? "justify-center px-2 min-[1200px]:justify-start min-[1200px]:gap-3 min-[1200px]:px-3"
      : "justify-start gap-3 px-3"

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      aria-label={item.label}
      title={item.label}
      className={`flex h-11 w-full items-center rounded-lg text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-acr-ink ${layoutClass} ${
        isActive
          ? "bg-acr-green-strong text-white"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon size={18} aria-hidden="true" className="shrink-0" />
      <span className={variant === "persistent" ? "sr-only min-[1200px]:not-sr-only" : undefined}>
        {item.label}
      </span>
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname() ?? "/"

  return (
    <aside
      aria-label="Navegação principal"
      className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col bg-acr-ink md:flex min-[1200px]:w-[220px]"
    >
      <Brand compact />

      <nav
        aria-label="Seções"
        className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-2 min-[1200px]:px-3"
      >
        {mainItems.map((item) => (
          <NavigationLink key={item.href} item={item} pathname={pathname} variant="persistent" />
        ))}
      </nav>

      <div className="shrink-0 space-y-3 px-2 pb-3 min-[1200px]:px-3">
        <NavigationLink item={configItem} pathname={pathname} variant="persistent" />
        <UserFooter variant="persistent" />
      </div>
    </aside>
  )
}

export function MobileNavigationSheet() {
  const pathname = usePathname() ?? "/"
  const [open, setOpen] = useState(false)
  const closeNavigation = () => setOpen(false)

  useEffect(() => {
    const tabletQuery = window.matchMedia("(min-width: 768px)")
    const closeOnPersistentNavigation = () => {
      if (tabletQuery.matches) setOpen(false)
    }

    closeOnPersistentNavigation()
    tabletQuery.addEventListener("change", closeOnPersistentNavigation)
    return () => tabletQuery.removeEventListener("change", closeOnPersistentNavigation)
  }, [])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu principal"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-acr-muted-2 transition-colors hover:bg-acr-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acr-green focus-visible:ring-offset-2 md:hidden"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </SheetTrigger>

      <SheetContent
        id="mobile-navigation"
        side="left"
        className="w-[min(20rem,calc(100vw-1rem))] gap-0 border-0 bg-acr-ink p-0 text-white shadow-none motion-reduce:transition-none motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none [&>button:last-child]:hidden sm:max-w-[20rem]"
      >
        <SheetTitle className="sr-only">Menu principal</SheetTitle>
        <SheetDescription className="sr-only">Navegação da plataforma ACR</SheetDescription>
        <SheetClose
          aria-label="Fechar menu principal"
          className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-acr-ink"
        >
          <X size={20} aria-hidden="true" />
        </SheetClose>

        <Brand />

        <nav aria-label="Seções" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {mainItems.map((item) => (
            <NavigationLink
              key={item.href}
              item={item}
              pathname={pathname}
              variant="mobile"
              onNavigate={closeNavigation}
            />
          ))}
        </nav>

        <div className="space-y-3 px-3 pb-3">
          <NavigationLink
            item={configItem}
            pathname={pathname}
            variant="mobile"
            onNavigate={closeNavigation}
          />
          <UserFooter variant="mobile" onNavigate={closeNavigation} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex h-[68px] items-center px-4 ${
        compact ? "justify-center min-[1200px]:justify-start min-[1200px]:gap-2.5" : "gap-2.5"
      }`}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-acr-green text-[13px] font-bold text-white">
        AC
      </div>
      <span className={compact ? "sr-only font-bold tracking-tight min-[1200px]:not-sr-only" : "font-bold tracking-tight"}>
        ACR
      </span>
    </div>
  )
}

function UserFooter({
  variant,
  onNavigate,
}: {
  variant: "persistent" | "mobile"
  onNavigate?: () => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [])

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    onNavigate?.()
    router.replace("/login")
    router.refresh()
  }

  const initial = email ? email[0]!.toUpperCase() : "?"

  if (variant === "mobile") {
    return (
      <div className="flex items-center gap-3 border-t border-white/10 px-1 pt-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold text-white">
          {initial}
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white">
          {email ?? "Carregando..."}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-acr-ink"
        >
          <LogOut size={16} aria-hidden="true" />
          Sair
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 border-t border-white/10 px-1 pt-3 min-[1200px]:flex-row min-[1200px]:gap-2.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold text-white">
        {initial}
      </div>
      <div className="hidden min-w-0 flex-1 flex-col leading-tight min-[1200px]:flex">
        <span className="truncate text-[13px] font-medium text-white">{email ?? "Carregando..."}</span>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 flex min-h-11 w-fit items-center gap-1 rounded px-2 text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <LogOut size={11} aria-hidden="true" />
          Sair
        </button>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        aria-label="Sair"
        title="Sair"
        className="flex size-11 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white min-[1200px]:hidden"
      >
        <LogOut size={17} aria-hidden="true" />
      </button>
    </div>
  )
}
