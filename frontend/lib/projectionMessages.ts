export function getProjectionMessage(
  projectedValue: number,
  target: number,
) {
  if (target <= 0) {
    return "Your projection is based on your current investment plan and long-term assumptions.";
  }

  const progress = (projectedValue / target) * 100;

  if (progress >= 100) {
    return (
      "Your current investment strategy is projected to reach "
      + "your long-term wealth goal within your investment horizon."
    );
  }

  if (progress >= 75) {
    return (
      `Your portfolio is projected to reach ${progress.toFixed(1)}% of your wealth goal. `
      + "You're making strong progress, and increasing contributions could help close the remaining gap."
    );
  }

  if (progress >= 50) {
    return (
      `Your portfolio is projected to reach ${progress.toFixed(1)}% of your wealth goal. `
      + "Increasing your contributions could significantly accelerate your progress."
    );
  }

  return (
    `Your current plan is projected to reach ${progress.toFixed(1)}% of your wealth goal. `
    + "Consistent investing and increasing your contributions can help you move closer to your target."
  );
}