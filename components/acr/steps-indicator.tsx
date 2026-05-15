"use client"

import { Check } from "lucide-react"

interface StepsIndicatorProps {
  activeStep: 1 | 2
}

export function StepsIndicator({ activeStep }: StepsIndicatorProps) {
  const step1Done = activeStep > 1

  return (
    <div className="max-w-xl mx-auto mb-6 flex items-center gap-3">
      <div className="flex items-center gap-2.5">
        <div
          className={`h-7 w-7 rounded-full flex items-center justify-center text-[13px] font-bold ${
            step1Done
              ? "bg-[#2D8C3A] text-white"
              : "bg-[#2D8C3A] text-white"
          }`}
        >
          {step1Done ? <Check size={14} /> : "1"}
        </div>
        <span className="text-[14px] font-bold text-[#2D8C3A]">Informações</span>
      </div>

      <div className="flex-1 h-px bg-[#D5DDD6]" />

      <div className="flex items-center gap-2.5">
        <div
          className={`h-7 w-7 rounded-full flex items-center justify-center text-[13px] font-bold ${
            activeStep === 2
              ? "bg-[#2D8C3A] text-white"
              : "border border-[#D5DDD6] text-[#6B7F6E]"
          }`}
        >
          2
        </div>
        <span
          className={`text-[14px] font-bold ${
            activeStep === 2 ? "text-[#2D8C3A]" : "text-[#6B7F6E]"
          }`}
        >
          Documentos
        </span>
      </div>
    </div>
  )
}
