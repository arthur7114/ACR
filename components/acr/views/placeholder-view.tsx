"use client"

import { Building2, Settings } from "lucide-react"

interface PlaceholderViewProps {
  title: string
  description: string
  icon: "building" | "settings"
}

export function PlaceholderView({ title, description, icon }: PlaceholderViewProps) {
  const Icon = icon === "building" ? Building2 : Settings
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-full bg-[#EFF7F1] flex items-center justify-center mb-4">
        <Icon size={28} className="text-[#2D8C3A]" />
      </div>
      <h1 className="text-[24px] font-bold text-[#1A2B1C]">{title}</h1>
      <p className="text-[14px] text-[#6B7F6E] mt-1 max-w-md">{description}</p>
    </div>
  )
}
