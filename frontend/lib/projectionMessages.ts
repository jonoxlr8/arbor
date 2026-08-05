export function getProjectionMessage(
  projectedValue: number,
  target = 1000000
) {
  const progress = (projectedValue / target) * 100;

  if (progress >= 100) {
    return "Your current investment strategy is projected to reach your long-term wealth goal.";
  }

  if (progress >= 50) {
    return (
      "Your portfolio is building strong momentum toward your wealth goal. "
      + "Increasing contributions could help accelerate your progress."
    );
  }

  return (
    "Your portfolio is on a long-term growth path. "
    + "Consistent investing and increasing contributions can help you reach your goal sooner."
  );
}