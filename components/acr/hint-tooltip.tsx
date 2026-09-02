"use client"

import * as React from "react"
import { Info } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * Texto de apoio que fica atrás de uma tooltip em vez de ocupar a tela.
 *
 * Regra desta base: quando um número já se explica sozinho, a definição e a
 * derivação dele não ficam soltas embaixo do valor — entram aqui. A primeira
 * linha é a definição; as seguintes são a derivação/ressalva, em tom menor.
 */
export type HintLines = Array<string | null | undefined | false>

export function normalizeHintLines(lines: HintLines): string[] {
  return lines.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
}

function HintBody({ lines }: { lines: string[] }) {
  return (
    <div className="max-w-[260px] space-y-1 text-left">
      {lines.map((line, index) => (
        <p key={line} className={index === 0 ? "text-[12px] leading-snug" : "text-[11px] leading-snug opacity-70"}>
          {line}
        </p>
      ))}
    </div>
  )
}

/**
 * Abre no hover e no foco; o clique cobre o toque, onde hover não existe.
 * O Radix fecha a tooltip no clique do gatilho; `preventDefault` no handler
 * passado ao `TooltipTrigger` cancela esse fechamento (composeEventHandlers).
 */
function useHintTrigger() {
  const [open, setOpen] = React.useState(false)
  const onClick = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setOpen(true)
  }, [])
  return { open, onOpenChange: setOpen, onClick }
}

/**
 * Envolve um gatilho próprio (card, célula, linha) numa tooltip de apoio.
 * Renderiza um botão para o texto ficar acessível por teclado e por toque.
 * Sem linhas de apoio, devolve o conteúdo sem gatilho nenhum.
 */
export function Hint({
  lines,
  children,
  className,
  side = "top",
  align = "center",
  label,
}: {
  lines: HintLines
  children: React.ReactNode
  className?: string
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  label?: string
}) {
  const items = normalizeHintLines(lines)
  const trigger = useHintTrigger()

  if (items.length === 0) return <div className={className}>{children}</div>

  return (
    <Tooltip delayDuration={150} open={trigger.open} onOpenChange={trigger.onOpenChange}>
      <TooltipTrigger asChild onClick={trigger.onClick}>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[#2D8C3A]",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} align={align} sideOffset={6} className="px-3 py-2 text-pretty">
        <HintBody lines={items} />
      </TooltipContent>
    </Tooltip>
  )
}

/** Ícone de informação como gatilho, para títulos e rótulos. */
export function HintIcon({
  lines,
  label,
  className,
  size = 13,
  side = "top",
  align = "center",
}: {
  lines: HintLines
  label: string
  className?: string
  size?: number
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
}) {
  const items = normalizeHintLines(lines)
  const trigger = useHintTrigger()

  if (items.length === 0) return null

  return (
    <Tooltip delayDuration={150} open={trigger.open} onOpenChange={trigger.onOpenChange}>
      <TooltipTrigger asChild onClick={trigger.onClick}>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full text-[#8A9A8C] outline-none transition hover:text-[#3D4F3F] focus-visible:ring-2 focus-visible:ring-[#2D8C3A]",
            className,
          )}
        >
          <Info size={size} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} align={align} sideOffset={6} className="px-3 py-2 text-pretty">
        <HintBody lines={items} />
      </TooltipContent>
    </Tooltip>
  )
}
