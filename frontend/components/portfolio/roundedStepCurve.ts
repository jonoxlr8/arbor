import type { CurveFactory } from "victory-vendor/d3-shape";

type Point = { x: number; y: number };

// Recharts supplies screen coordinates. This curve only changes SVG geometry:
// values stay flat through gaps and each turn begins at the next observation's x.
export const roundedStepAfter: CurveFactory = context => {
  let points: Point[] = [];
  let area = false;
  let baseline = false;
  return {
    areaStart() { area = true; baseline = false; },
    areaEnd() { area = false; },
    lineStart() { points = []; },
    point(x, y) { points.push({ x, y }); },
    lineEnd() {
      if (!points.length) return;
      const first = points[0];
      if (baseline) context.lineTo(first.x, first.y);
      else context.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1], next = points[i];
        if (baseline || next.y === previous.y) {
          context.lineTo(next.x, next.y);
          continue;
        }
        // The incoming hold reaches the genuine timestamp before any turn.
        context.lineTo(next.x, previous.y);
        // The chart reserves 8px on the right, enough for a 6px final turn.
        const nextGap = points[i + 1] ? points[i + 1].x - next.x : 9;
        const radius = Math.min(3, Math.abs(next.y - previous.y) / 4, Math.max(0, nextGap / 3));
        if (radius < 0.25) {
          context.lineTo(next.x, next.y);
          continue;
        }
        const direction = Math.sign(next.y - previous.y);
        context.quadraticCurveTo(next.x + radius, previous.y, next.x + radius, previous.y + direction * radius);
        context.lineTo(next.x + radius, next.y - direction * radius);
        context.quadraticCurveTo(next.x + radius, next.y, next.x + 2 * radius, next.y);
      }
      if (area) {
        if (baseline) context.closePath();
        baseline = !baseline;
      }
    },
  };
};
