"use client"

import { X } from "lucide-react"
import type { IptuStatus } from "@/lib/iptu-types"

export const inputClass =
  "h-9 w-full rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] text-[#3D4F3F] outline-none focus:border-[#2D8C3A] focus:ring-2 focus:ring-[#2D8C3A]/15"

export const labelClass = "mb-1 block text-[10px] font-medium uppercase tracking-wide text-[#6B7F6E]"

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  type = "text",
  placeholder,
  step,
  min,
}: {
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  step?: string
  min?: string
}) {
  return (
    <input
      type={type}
      step={step}
      min={min}
      placeholder={placeholder}
      className={inputClass}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function SelectInput({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
      {children}
    </select>
  )
}

const STATUS_STYLE: Record<IptuStatus, { label: string; className: string }> = {
  aberto: { label: "Aberto", className: "bg-[#EFF7F1] text-[#166534]" },
  vencido: { label: "Vencido", className: "bg-[#FEF2F2] text-[#B91C1C]" },
  pago: { label: "Pago", className: "bg-[#DCFCE7] text-[#166534]" },
}

export function IptuStatusBadge({ status }: { status: IptuStatus }) {
  const style = STATUS_STYLE[status]
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${style.className}`}>
      {style.label}
    </span>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border border-[#EEF1EE] bg-white shadow-xl ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#EEF1EE] px-5 py-4">
          <h2 className="text-[16px] font-bold text-[#1A2B1C]">{title}</h2>
          <button onClick={onClose} className="text-[#6B7F6E] hover:text-[#3D4F3F]" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-[#EEF1EE] px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: "button" | "submit"
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#2D8C3A] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#1A5C24] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#D5DDD6] bg-white px-4 text-[14px] font-medium text-[#3D4F3F] transition-colors hover:bg-[#EEF1EE] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  )
}
