export type Distribution =
  | { type: "uniform"; min: number; max: number }
  | { type: "gaussian"; mean: number; stddev: number }
  | { type: "lognormal"; low: number; high: number }
  | { type: "poisson"; lambda: number };

export const DISTRIBUTION_TYPES = ["uniform", "gaussian", "lognormal", "poisson"] as const;

function randomNormal(): number {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sample(dist: Distribution): number {
  switch (dist.type) {
    case "uniform":
      return dist.min + Math.random() * (dist.max - dist.min);
    case "gaussian":
      return dist.mean + dist.stddev * randomNormal();
    case "lognormal": {
      // low and high are P10 and P90
      // z_0.1 = -1.2816, z_0.9 = 1.2816
      const mu = (Math.log(dist.low) + Math.log(dist.high)) / 2;
      const sigma = (Math.log(dist.high) - Math.log(dist.low)) / (2 * 1.2816);
      return Math.exp(mu + sigma * randomNormal());
    }
    case "poisson": {
      const L = Math.exp(-dist.lambda);
      let k = 0, p = 1;
      do { k++; p *= Math.random(); } while (p > L);
      return k - 1;
    }
  }
}

export function defaultDistribution(): Distribution {
  return { type: "uniform", min: 0, max: 100 };
}
