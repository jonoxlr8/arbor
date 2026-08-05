type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export default function SectionHeader({
  eyebrow,
  title,
  description,
}: SectionHeaderProps) {
  return (
    <div className="mb-12">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
        {eyebrow}
      </p>

      <h2 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
        {title}
      </h2>

      <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
        {description}
      </p>
    </div>
  );
}
