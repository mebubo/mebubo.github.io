import { type Expr, evaluate } from "./formula";
import { type Distribution, sample } from "./distributions";

export interface SimulationResult {
  samples: number[];
  mean: number;
  median: number;
  p5: number;
  p10: number;
  p90: number;
  p95: number;
  histogram: { min: number; max: number; bins: number[] };
}

export function simulate(
  expr: Expr,
  params: Record<string, Distribution>,
  n: number = 10000,
): SimulationResult {
  const samples: number[] = [];

  for (let i = 0; i < n; i++) {
    const vars: Record<string, number> = {};
    for (const [name, dist] of Object.entries(params)) {
      vars[name] = sample(dist);
    }
    try {
      const result = evaluate(expr, vars);
      if (isFinite(result)) samples.push(result);
    } catch {
      // skip invalid samples
    }
  }

  samples.sort((a, b) => a - b);

  const len = samples.length;
  if (len === 0) throw new Error("No valid samples produced");

  const mean = samples.reduce((s, x) => s + x, 0) / len;
  const median = samples[Math.floor(len / 2)];
  const p5 = samples[Math.floor(len * 0.05)];
  const p10 = samples[Math.floor(len * 0.1)];
  const p90 = samples[Math.floor(len * 0.9)];
  const p95 = samples[Math.floor(len * 0.95)];

  const binCount = 60;
  const min = samples[0];
  const max = samples[len - 1];
  const binWidth = (max - min) / binCount;
  const bins = new Array(binCount).fill(0);

  if (binWidth > 0) {
    for (const s of samples) {
      const bin = Math.min(Math.floor((s - min) / binWidth), binCount - 1);
      bins[bin]++;
    }
  } else {
    bins[0] = len;
  }

  return { samples, mean, median, p5, p10, p90, p95, histogram: { min, max, bins } };
}
