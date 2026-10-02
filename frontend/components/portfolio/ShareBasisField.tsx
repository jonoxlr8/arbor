import { shareBasisLabel, type ShareBasis } from "@/lib/shareBasis";

export default function ShareBasisField({ value, onChange }: { value?: ShareBasis | null; onChange: (value: ShareBasis | null) => void }) {
  return <label className="block text-sm">VGT share count basis
    <select className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" required value={value ?? ""} onChange={event => onChange(event.target.value as ShareBasis || null)}>
      <option value="">Choose the share count basis</option>
      <option value="before_split">{shareBasisLabel("before_split")}</option>
      <option value="after_split">{shareBasisLabel("after_split")}</option>
    </select>
    <small className="mt-1 block text-slate-600">VGT split 8-for-1 on April 21, 2026. Choose the basis of the share count, not when you typed this record into Arbor. Recorded PHP cost stays unchanged.</small>
  </label>;
}
