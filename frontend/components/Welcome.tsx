type WelcomeProps = {
  step: number;
  name: string;
};

export default function Welcome({ step, name }: WelcomeProps) {
  return (
    <div className="mt-12">
      {step === 1 ? (
        <>
          <h2 className="text-3xl font-bold text-slate-900">
            Welcome 👋
          </h2>

          <p className="mt-3 text-lg text-slate-600">
            Let's build your investment plan together.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-3xl font-bold text-slate-900">
            Hi {name} 👋
          </h2>

          <p className="mt-3 text-lg text-slate-600">
            Nice to meet you.
          </p>
        </>
      )}
    </div>
  );
}