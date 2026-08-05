type HealthSectionProps = {
  plan: any;
};

export default function HealthSection({ plan }: HealthSectionProps) {
  return (
    <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-slate-900">🌳 Portfolio Health</h2>

      <div className="mt-4">
        <p className="text-4xl font-bold text-emerald-700">
          {plan.health?.score ?? "—"} / 10
        </p>

        <p className="mt-2 text-slate-600">
          Your portfolio is aligned with your long-term wealth-building goals.
        </p>
      </div>

      <div className="mt-6 space-y-2 text-slate-700">
        {plan.health?.strengths?.map((item: string) => (
          <p key={item}>✅ {item}</p>
        ))}

        {plan.health?.warnings?.map((item: string) => (
          <p key={item}>⚠️ {item}</p>
        ))}
      </div>
    </section>
  );
}
