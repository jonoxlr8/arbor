export function ArborMark({ className = "h-10 w-10" }: { className?: string }) {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className}>
    <path d="M4 34 17.5 5h5L36 34h-6.5L20 13 10.5 34Z" fill="currentColor" />
    <path d="M13 28c0-7 4.5-11 13-11 0 7-4.5 11-13 11Zm3-2 7-6" fill="currentColor" />
    <path d="m14 30 10-10" stroke="var(--logo-cutout, var(--background))" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}

export default function Logo({ compact = false, horizontal = false }: { compact?: boolean; horizontal?: boolean }) {
  return (
    <div className={horizontal ? "flex items-center gap-2 text-forest" : "text-center text-forest"}>
      <ArborMark className={horizontal ? "h-10 w-10 shrink-0" : "mx-auto h-12 w-12"} />
      {!compact && <span className={horizontal ? "text-xl font-semibold tracking-[0.16em]" : "mt-3 block text-3xl font-semibold tracking-[0.16em]"}>ARBOR</span>}
      {!horizontal && !compact && <p className="mt-3 text-sm text-slate-600">Build wealth. Grow with Arbor.</p>}
    </div>
  );
}
