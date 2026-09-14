import { arborMarkPaths, arborMarkViewBox } from "@/lib/arborBrand";

export function ArborMark({ className = "h-10 w-14" }: { className?: string }) {
  return <svg viewBox={arborMarkViewBox} fill="currentColor" aria-hidden="true" className={`arbor-logo-color ${className}`}>
    {arborMarkPaths.map(path => <path key={path} d={path} />)}
  </svg>;
}

export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="arbor-logo-color inline-flex items-center gap-3" aria-label={compact ? "Arbor" : undefined}>
      <ArborMark className="h-10 w-14 shrink-0" />
      {!compact && <span className="text-2xl font-bold tracking-[0.08em]">ARBOR</span>}
    </div>
  );
}
