import { sleeveColors } from "../AssetIdentity";
import { SLEEVE_LABELS } from "@/lib/contributions";
import type { Sleeve } from "@/lib/types/contributions";

export default function Allocation({ weights, label = "Target allocation" }: { weights: { role: Sleeve; percentage_points: number }[]; label?: string }) {
  const stops = weights.map((w, index) => { const start = weights.slice(0, index).reduce((sum, entry) => sum + entry.percentage_points, 0); return `${sleeveColors[w.role]} ${start}% ${start + w.percentage_points}%`; });
  return <div className="allocation-layout" aria-label={label}>
    <div className="allocation-ring" aria-hidden="true" style={{ background: `conic-gradient(${stops.join(",")})` }}><div><span>{label === "Current allocation" ? "Recorded" : "Your plan"}</span><small>{label === "Current allocation" ? "Current mix" : "Target mix"}</small></div></div>
    <dl className="allocation-legend">{weights.map(w => <div key={w.role}><dt><span className="allocation-dot" style={{ background: sleeveColors[w.role] }} />{SLEEVE_LABELS[w.role]}</dt><dd>{w.percentage_points.toLocaleString(undefined,{maximumFractionDigits:2})}%</dd></div>)}</dl>
  </div>;
}
