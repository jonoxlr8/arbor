type ProgressBarProps = {
  step: number;
  totalSteps: number;
};

export default function ProgressBar({
  step,
  totalSteps,
}: ProgressBarProps) {
  const progress = (step / totalSteps) * 100;

  return (
    <div className="mt-8">
      <div className="mb-2 flex justify-between text-sm font-medium text-slate-600">
        <span>
          Step {step} of {totalSteps}
        </span>

        <span>
          {Math.round(progress)}%
        </span>
      </div>

      <div className="h-2 w-full rounded-full bg-slate-200">
        <div
          className="h-2 rounded-full bg-green-600 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}