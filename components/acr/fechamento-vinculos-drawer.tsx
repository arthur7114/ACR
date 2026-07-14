"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { FechamentoVinculosImoveis } from "@/lib/server/fechamento-imoveis"
import { VinculoResolver } from "./fechamento-vinculos-drawer-panels"
import { useFechamentoVinculosDrawer } from "./fechamento-vinculos-drawer-state"

export function FechamentoVinculosDrawer(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fechamentoId: string
  vinculos: FechamentoVinculosImoveis
  onResolved: (vinculos: FechamentoVinculosImoveis) => Promise<void> | void
}) {
  const controller = useFechamentoVinculosDrawer(props)
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto border-[#D5DDD6] p-0 sm:max-w-[540px]">
        <SheetHeader className="border-b border-[#EEF1EE] px-5 py-4 pr-12 text-left">
          <SheetTitle className="text-[17px] text-[#1A2B1C]">Resolver vínculos de imóveis</SheetTitle>
          <SheetDescription className="text-[12px] text-[#6B7F6E]">Vincule ou crie um cadastro por vez. Nenhum dado existente será sobrescrito sem sua confirmação.</SheetDescription>
        </SheetHeader>
        <VinculoResolver controller={controller} />
      </SheetContent>
    </Sheet>
  )
}
