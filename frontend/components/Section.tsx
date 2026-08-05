type SectionProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export default function Section({
  title,
  subtitle,
  children,
}: SectionProps) {
  return (
    <section className="mt-12">

      <h2 className="text-2xl font-bold text-slate-900">
        {title}
      </h2>

      {subtitle && (
        <p className="mt-2 text-slate-500">
          {subtitle}
        </p>
      )}

      <div className="mt-6">
        {children}
      </div>

    </section>
  );
}