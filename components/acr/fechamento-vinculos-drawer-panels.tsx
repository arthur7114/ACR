"use client"

import { Building2, CheckCircle, Link2, Search } from "lucide-react"
import { formatBRL } from "@/lib/format"
import type { ImovelVinculoCadastro } from "@/lib/server/fechamento-imoveis"
import type { VinculoController } from "./fechamento-vinculos-drawer-state"

export function VinculoResolver({ controller }: { controller: VinculoController }) {
  if (!controller.current) return <ResolvedState />
  return (
    <div className="space-y-5 p-5">
      <Progress controller={controller} />
      <RevenueSummary controller={controller} />
      <ModeTabs controller={controller} />
      {controller.mode === "existente" ? <ExistingPanel controller={controller} /> : <CreatePanel controller={controller} />}
      {controller.error ? <p role="alert" className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#991B1B]">{controller.error}</p> : null}
      <ResolveButton controller={controller} />
    </div>
  )
}

function Progress({ controller }: { controller: VinculoController }) {
  const current = Math.min(controller.progress + 1, Math.max(controller.batchTotal, 1))
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-[#6B7F6E]"><span>{current} de {controller.batchTotal || controller.pendingCount}</span><span>{controller.pendingCount} pendente(s)</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EEF1EE]" role="progressbar" aria-label="Progresso dos vínculos" aria-valuemin={0} aria-valuemax={Math.max(controller.batchTotal, 1)} aria-valuenow={current}>
        <div className="h-full rounded-full bg-[#2D8C3A] transition-all" style={{ width: `${(current / Math.max(controller.batchTotal, 1)) * 100}%` }} />
      </div>
    </div>
  )
}

function RevenueSummary({ controller }: { controller: VinculoController }) {
  const item = controller.current!
  return (
    <div className="rounded-xl border border-[#BFE4C7] bg-[#F4F9F5] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2D8C3A]">Receita do fechamento</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <SummaryField label="Código/unidade" value={item.apto || "Não informado"} />
        <SummaryField label="Aluguel" value={item.aluguel === null ? "—" : formatBRL(item.aluguel)} />
        <div className="col-span-2"><SummaryField label="Inquilino extraído" value={item.inquilino || "Não informado"} /></div>
      </div>
    </div>
  )
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-[#6B7F6E]">{label}</p><p className="text-[14px] font-semibold text-[#1A2B1C]">{value}</p></div>
}

function ModeTabs({ controller }: { controller: VinculoController }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Forma de resolver vínculo">
      <ModeTab label="Buscar existente" active={controller.mode === "existente"} target="vinculo-existente" onClick={() => controller.setMode("existente")} />
      <ModeTab label="Criar novo" active={controller.mode === "criar"} target="vinculo-criar" onClick={() => controller.setMode("criar")} />
    </div>
  )
}

function ModeTab({ label, active, target, onClick }: { label: string; active: boolean; target: string; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={active} aria-controls={target} onClick={onClick} className={`h-10 rounded-lg border text-[12px] font-semibold ${active ? "border-[#2D8C3A] bg-[#EFF7F1] text-[#1A5C24]" : "border-[#D5DDD6] bg-white text-[#3D4F3F]"}`}>{label}</button>
}

function ExistingPanel({ controller }: { controller: VinculoController }) {
  return (
    <div id="vinculo-existente" role="tabpanel" className="space-y-4">
      <label className="relative block"><span className="sr-only">Buscar imóvel cadastrado</span><Search size={14} className="absolute left-3 top-3 text-[#6B7F6E]" /><input value={controller.search} onChange={(event) => controller.setSearch(event.target.value)} placeholder="Buscar por código, unidade ou inquilino" className="h-10 w-full rounded-lg border border-[#D5DDD6] pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-[#2D8C3A]" /></label>
      <CandidateList controller={controller} />
      {controller.selected ? <PropertyComparison controller={controller} selected={controller.selected} /> : null}
    </div>
  )
}

function CandidateList({ controller }: { controller: VinculoController }) {
  if (controller.candidates.length === 0) return <p className="rounded-lg border border-dashed border-[#D5DDD6] p-4 text-center text-[12px] text-[#6B7F6E]">Nenhum cadastro encontrado. Tente outra busca ou crie um novo.</p>
  return (
    <div className="max-h-48 space-y-2 overflow-y-auto" role="listbox" aria-label="Imóveis cadastrados">
      {controller.candidates.map((item) => <Candidate key={item.id} item={item} selected={controller.selectedId === item.id} onSelect={() => controller.setSelectedId(item.id)} />)}
    </div>
  )
}

function Candidate({ item, selected, onSelect }: { item: ImovelVinculoCadastro; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} role="option" aria-selected={selected} className={`flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left ${selected ? "border-[#2D8C3A] bg-[#EFF7F1]" : "border-[#EEF1EE] hover:border-[#BFE4C7]"}`}>
      <span><span className="block text-[12px] font-semibold text-[#1A2B1C]">{item.unidade}</span><span className="mt-0.5 block text-[11px] text-[#6B7F6E]">Código {item.codigo_imobiliaria} · {item.inquilino_nome || "sem inquilino"}</span></span>
      {selected ? <CheckCircle size={16} className="mt-0.5 shrink-0 text-[#2D8C3A]" /> : null}
    </button>
  )
}

function PropertyComparison({ controller, selected }: { controller: VinculoController; selected: ImovelVinculoCadastro }) {
  const current = controller.current!
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7F6E]">Comparação antes de vincular</p>
      <ComparisonRow label="Inquilino" cadastro={selected.inquilino_nome ?? ""} fechamento={current.inquilino} checked={controller.updates.inquilino} onChange={(value) => controller.setUpdates((state) => ({ ...state, inquilino: value }))} />
      <ComparisonRow label="Status" cadastro={selected.status} fechamento={current.status_sugerido} checked={controller.updates.status} onChange={(value) => controller.setUpdates((state) => ({ ...state, status: value }))} />
      <ComparisonRow label="Aluguel esperado" cadastro={selected.valor_aluguel_esperado === null ? "" : formatBRL(selected.valor_aluguel_esperado)} fechamento={current.aluguel === null ? "" : formatBRL(current.aluguel)} checked={controller.updates.aluguel} onChange={(value) => controller.setUpdates((state) => ({ ...state, aluguel: value }))} />
    </div>
  )
}

function ComparisonRow({ label, cadastro, fechamento, checked, onChange }: { label: string; cadastro: string; fechamento: string; checked: boolean; onChange: (value: boolean) => void }) {
  const differs = cadastro !== fechamento
  return (
    <div className="rounded-lg border border-[#EEF1EE] p-3">
      <div className="flex items-center justify-between gap-3"><p className="text-[12px] font-semibold text-[#1A2B1C]">{label}</p>{differs ? <span className="text-[10px] font-semibold uppercase text-[#92400E]">Diferente</span> : null}</div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-[11px]"><ComparisonValue label="Cadastro atual" value={cadastro} /><ComparisonValue label="Fechamento" value={fechamento} /></div>
      {differs ? <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] text-[#3D4F3F]"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 accent-[#2D8C3A]" />Atualizar o cadastro com o valor do fechamento</label> : null}
    </div>
  )
}

function ComparisonValue({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[#6B7F6E]">{label}</p><p className="mt-0.5 break-words font-medium text-[#1A2B1C]">{value || "Não informado"}</p></div>
}

function CreatePanel({ controller }: { controller: VinculoController }) {
  const set = (field: keyof typeof controller.form, value: string) => controller.setForm((state) => ({ ...state, [field]: value }))
  return (
    <div id="vinculo-criar" role="tabpanel" className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><TextField label="Código da imobiliária" value={controller.form.codigo} onChange={(value) => set("codigo", value)} /><TextField label="Unidade" value={controller.form.unidade} onChange={(value) => set("unidade", value)} /></div>
      <TextField label="Inquilino sugerido" value={controller.form.inquilino} onChange={(value) => set("inquilino", value)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><StatusField value={controller.form.status} onChange={(value) => set("status", value)} /><TextField label="Aluguel esperado" value={controller.form.aluguel} inputMode="decimal" onChange={(value) => set("aluguel", value)} /></div>
      <p className="text-[11px] leading-relaxed text-[#6B7F6E]">Código e unidade foram preenchidos a partir da receita. Inquilino, status e aluguel são sugestões editáveis.</p>
    </div>
  )
}

function TextField({ label, value, inputMode, onChange }: { label: string; value: string; inputMode?: "decimal"; onChange: (value: string) => void }) {
  return <label className="block text-[11px] font-medium text-[#3D4F3F]">{label}<input inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#D5DDD6] px-3 text-[13px] outline-none focus:ring-2 focus:ring-[#2D8C3A]" /></label>
}

function StatusField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="block text-[11px] font-medium text-[#3D4F3F]">Status sugerido<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#D5DDD6] bg-white px-3 text-[13px] outline-none focus:ring-2 focus:ring-[#2D8C3A]"><option value="ocupado">Ocupado</option><option value="vago">Vago</option><option value="inadimplente">Inadimplente</option><option value="em_rescisao">Em rescisão</option><option value="em_negociacao">Em negociação</option></select></label>
}

function ResolveButton({ controller }: { controller: VinculoController }) {
  const disabled = controller.saving || (controller.mode === "existente" ? !controller.selectedId : !controller.form.codigo.trim() || !controller.form.unidade.trim())
  return <button type="button" onClick={() => void controller.resolveCurrent()} disabled={disabled} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2D8C3A] px-4 text-[13px] font-semibold text-white hover:bg-[#1A5C24] disabled:cursor-not-allowed disabled:opacity-50">{controller.mode === "existente" ? <Link2 size={15} /> : <Building2 size={15} />}{controller.saving ? "Salvando..." : controller.mode === "existente" ? "Vincular imóvel" : "Criar e vincular"}</button>
}

function ResolvedState() {
  return <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><CheckCircle size={32} className="text-[#2D8C3A]" /><p className="mt-3 text-[15px] font-semibold text-[#1A2B1C]">Todos os vínculos foram resolvidos</p><p className="mt-1 text-[12px] text-[#6B7F6E]">O fechamento pode seguir para as demais validações.</p></div>
}
