import { useState, useMemo, useEffect } from "react";
import { parse, extractVariables } from "./formula";
import { type Distribution, DISTRIBUTION_TYPES, defaultDistribution } from "./distributions";
import { simulate, type SimulationResult } from "./simulate";

function formatNum(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e6 || abs < 0.01) return n.toExponential(2);
  if (Number.isInteger(n) && abs < 1e6) return n.toLocaleString();
  return n.toPrecision(4);
}

function pdfAt(dist: Distribution, x: number): number {
  switch (dist.type) {
    case "uniform":
      if (dist.max <= dist.min) return 0;
      return x >= dist.min && x <= dist.max ? 1 / (dist.max - dist.min) : 0;
    case "gaussian": {
      const s = Math.abs(dist.stddev) || 1;
      return (1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - dist.mean) / s) ** 2);
    }
    case "lognormal": {
      if (x <= 0) return 0;
      const lo = Math.max(dist.low, 1e-9);
      const hi = Math.max(dist.high, lo * 1.001);
      const mu = (Math.log(lo) + Math.log(hi)) / 2;
      const sigma = Math.max((Math.log(hi) - Math.log(lo)) / (2 * 1.2816), 0.01);
      return (1 / (x * sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((Math.log(x) - mu) / sigma) ** 2);
    }
    case "poisson":
      return 0;
  }
}

function getGraphRange(dist: Distribution): [number, number] {
  switch (dist.type) {
    case "uniform": {
      const pad = Math.max((dist.max - dist.min) * 0.25, 1);
      return [dist.min - pad, dist.max + pad];
    }
    case "gaussian": {
      const s = Math.abs(dist.stddev) || 1;
      return [dist.mean - 3.5 * s, dist.mean + 3.5 * s];
    }
    case "lognormal": {
      const lo = Math.max(dist.low, 1e-9);
      const hi = Math.max(dist.high, lo * 1.001);
      const mu = (Math.log(lo) + Math.log(hi)) / 2;
      const sigma = Math.max((Math.log(hi) - Math.log(lo)) / (2 * 1.2816), 0.01);
      return [0, Math.exp(mu + 3 * sigma)];
    }
    case "poisson":
      return [0, 0];
  }
}

function DistributionGraph({ dist }: { dist: Distribution }) {
  const W = 300, H = 56;

  if (dist.type === "poisson") {
    const lambda = Math.max(dist.lambda, 0.001);
    const kMax = Math.min(Math.ceil(lambda + 4 * Math.sqrt(lambda) + 4), 60);
    const bars: number[] = [];
    for (let k = 0; k <= kMax; k++) {
      let logP = k * Math.log(lambda) - lambda;
      for (let j = 1; j <= k; j++) logP -= Math.log(j);
      bars.push(Math.exp(logP));
    }
    const maxP = Math.max(...bars, 1e-10);
    const barW = W / bars.length;
    return (
      <svg className="dist-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {bars.map((p, k) => {
          const h = (p / maxP) * H;
          return <rect key={k} x={k * barW + 0.5} y={H - h} width={Math.max(barW - 1, 0.5)} height={h} fill="#5b8fb9" opacity={0.7} />;
        })}
      </svg>
    );
  }

  const [xMin, xMax] = getGraphRange(dist);
  if (xMax <= xMin) return null;

  const N = 120;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const x = xMin + (i / N) * (xMax - xMin);
    pts.push([x, pdfAt(dist, x)]);
  }

  const maxY = Math.max(...pts.map((p) => p[1]), 1e-10);
  const sx = (x: number) => ((x - xMin) / (xMax - xMin)) * W;
  const sy = (y: number) => H - (y / maxY) * H * 0.95;

  const linePts = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  const fillPath = `${linePts} L${sx(pts[pts.length - 1][0]).toFixed(1)},${H} L${sx(pts[0][0]).toFixed(1)},${H} Z`;

  return (
    <svg className="dist-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path d={fillPath} fill="#5b8fb9" opacity={0.2} />
      <path d={linePts} fill="none" stroke="#5b8fb9" strokeWidth={1.5} />
    </svg>
  );
}

function getSliderBounds(dist: Distribution): Record<string, [number, number]> {
  switch (dist.type) {
    case "uniform": {
      const span = Math.max(dist.max - dist.min, Math.abs(dist.max), Math.abs(dist.min), 1);
      const lo = Math.min(dist.min, 0) - span * 0.5;
      const hi = dist.max + span * 1.5;
      return { min: [lo, hi], max: [lo, hi] };
    }
    case "gaussian": {
      const spread = Math.max(Math.abs(dist.stddev) * 5, Math.abs(dist.mean) * 0.5, 10);
      return {
        mean: [dist.mean - spread, dist.mean + spread],
        stddev: [0, Math.max(Math.abs(dist.stddev) * 5, 1)],
      };
    }
    case "lognormal": {
      const hi = Math.max(dist.high, 1);
      const lo = Math.max(dist.low, 0.01);
      return {
        low: [lo * 0.01, hi * 5],
        high: [lo * 0.1, hi * 10],
      };
    }
    case "poisson":
      return { lambda: [0, Math.max(dist.lambda * 5, 20)] };
  }
}

function Field({
  label,
  value,
  onChange,
  sliderMin = 0,
  sliderMax = 100,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  sliderMin?: number;
  sliderMax?: number;
}) {
  const step = (sliderMax - sliderMin) / 200;
  const clamped = Math.min(Math.max(value, sliderMin), sliderMax);

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="field-controls">
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={step}
          value={clamped}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="field-slider"
        />
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          className="field-number"
        />
      </div>
    </div>
  );
}

function DistributionEditor({
  name,
  dist,
  onChange,
}: {
  name: string;
  dist: Distribution;
  onChange: (d: Distribution) => void;
}) {
  const switchType = (type: Distribution["type"]) => {
    switch (type) {
      case "uniform":   return onChange({ type: "uniform", min: 0, max: 100 });
      case "gaussian":  return onChange({ type: "gaussian", mean: 50, stddev: 10 });
      case "lognormal": return onChange({ type: "lognormal", low: 10, high: 1000 });
      case "poisson":   return onChange({ type: "poisson", lambda: 10 });
    }
  };

  const bounds = getSliderBounds(dist);

  return (
    <div className="parameter">
      <div className="parameter-header">
        <span className="parameter-name">{name}</span>
        <select value={dist.type} onChange={(e) => switchType(e.target.value as Distribution["type"])}>
          {DISTRIBUTION_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <DistributionGraph dist={dist} />
      <div className="parameter-fields">
        {dist.type === "uniform" && (
          <>
            <Field label="min" value={dist.min} onChange={(v) => onChange({ ...dist, min: v })} sliderMin={bounds.min[0]} sliderMax={bounds.min[1]} />
            <Field label="max" value={dist.max} onChange={(v) => onChange({ ...dist, max: v })} sliderMin={bounds.max[0]} sliderMax={bounds.max[1]} />
          </>
        )}
        {dist.type === "gaussian" && (
          <>
            <Field label="μ" value={dist.mean} onChange={(v) => onChange({ ...dist, mean: v })} sliderMin={bounds.mean[0]} sliderMax={bounds.mean[1]} />
            <Field label="σ" value={dist.stddev} onChange={(v) => onChange({ ...dist, stddev: v })} sliderMin={bounds.stddev[0]} sliderMax={bounds.stddev[1]} />
          </>
        )}
        {dist.type === "lognormal" && (
          <>
            <Field label="low (P10)" value={dist.low} onChange={(v) => onChange({ ...dist, low: v })} sliderMin={bounds.low[0]} sliderMax={bounds.low[1]} />
            <Field label="high (P90)" value={dist.high} onChange={(v) => onChange({ ...dist, high: v })} sliderMin={bounds.high[0]} sliderMax={bounds.high[1]} />
          </>
        )}
        {dist.type === "poisson" && (
          <Field label="λ" value={dist.lambda} onChange={(v) => onChange({ ...dist, lambda: v })} sliderMin={bounds.lambda[0]} sliderMax={bounds.lambda[1]} />
        )}
      </div>
    </div>
  );
}

function Histogram({ result }: { result: SimulationResult }) {
  const { histogram, p10, p90 } = result;
  const maxBin = Math.max(...histogram.bins);
  const W = 600;
  const H = 180;
  const PAD = 24;
  const barW = W / histogram.bins.length;
  const range = histogram.max - histogram.min;

  const toX = (val: number) => range > 0 ? ((val - histogram.min) / range) * W : W / 2;

  return (
    <svg className="histogram" viewBox={`0 0 ${W} ${H + PAD}`}>
      {histogram.bins.map((count, i) => {
        const barH = maxBin > 0 ? (count / maxBin) * H : 0;
        return (
          <rect
            key={i}
            x={i * barW}
            y={H - barH}
            width={Math.max(barW - 0.5, 0.5)}
            height={barH}
            fill="#5b8fb9"
          />
        );
      })}
      <line x1={toX(p10)} y1={0} x2={toX(p10)} y2={H} stroke="#c55" strokeWidth={1.5} strokeDasharray="4 2" />
      <line x1={toX(p90)} y1={0} x2={toX(p90)} y2={H} stroke="#c55" strokeWidth={1.5} strokeDasharray="4 2" />
      <text x={2} y={H + 16} fontSize={11} fill="#888">{formatNum(histogram.min)}</text>
      <text x={W - 2} y={H + 16} fontSize={11} fill="#888" textAnchor="end">{formatNum(histogram.max)}</text>
      <text x={toX(p10)} y={H + 16} fontSize={10} fill="#c55" textAnchor="middle">P10</text>
      <text x={toX(p90)} y={H + 16} fontSize={10} fill="#c55" textAnchor="middle">P90</text>
    </svg>
  );
}

function Stats({ result }: { result: SimulationResult }) {
  const items = [
    { label: "Mean", value: result.mean },
    { label: "Median", value: result.median },
    { label: "P10", value: result.p10 },
    { label: "P90", value: result.p90 },
  ];
  return (
    <div className="stats">
      {items.map((item) => (
        <div key={item.label} className="stat">
          <div className="stat-label">{item.label}</div>
          <div className="stat-value">{formatNum(item.value)}</div>
        </div>
      ))}
    </div>
  );
}

export function App() {
  const [formula, setFormula] = useState("population * meals_per_day * price");
  const [distributions, setDistributions] = useState<Record<string, Distribution>>({
    population: { type: "lognormal", low: 500000, high: 2000000 },
    meals_per_day: { type: "uniform", min: 2, max: 4 },
    price: { type: "gaussian", mean: 12, stddev: 3 },
  });

  const parsed = useMemo(() => {
    try {
      const expr = parse(formula);
      const vars = extractVariables(expr);
      return { expr, vars, error: null };
    } catch (e) {
      return { expr: null, vars: [] as string[], error: (e as Error).message };
    }
  }, [formula]);

  const varsKey = parsed.vars.join(",");
  useEffect(() => {
    if (parsed.vars.length === 0) return;
    setDistributions((prev) => {
      const next: Record<string, Distribution> = {};
      for (const v of parsed.vars) {
        next[v] = prev[v] ?? defaultDistribution();
      }
      return next;
    });
  }, [varsKey]);

  const result = useMemo<SimulationResult | null>(() => {
    if (!parsed.expr || parsed.vars.length === 0) return null;
    for (const v of parsed.vars) {
      if (!distributions[v]) return null;
    }
    try {
      return simulate(parsed.expr, distributions);
    } catch {
      return null;
    }
  }, [parsed.expr, varsKey, distributions]);

  const updateDist = (name: string, d: Distribution) =>
    setDistributions((prev) => ({ ...prev, [name]: d }));

  return (
    <div className="app">
      <h1>Fermi Estimator</h1>

      <section>
        <label htmlFor="formula">Formula</label>
        <input
          id="formula"
          className="formula-input"
          type="text"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder="e.g. population * rate * duration"
          autoComplete="off"
          spellCheck={false}
        />
        {parsed.error && <div className="error">{parsed.error}</div>}
      </section>

      {parsed.vars.length > 0 && (
        <section>
          <h2>Parameters</h2>
          <div className="parameters">
            {parsed.vars.map((v) => (
              <DistributionEditor
                key={v}
                name={v}
                dist={distributions[v] ?? defaultDistribution()}
                onChange={(d) => updateDist(v, d)}
              />
            ))}
          </div>
        </section>
      )}

      {result && (
        <section>
          <h2>Result <span className="sample-count">({result.samples.length.toLocaleString()} samples)</span></h2>
          <Stats result={result} />
          <Histogram result={result} />
        </section>
      )}
    </div>
  );
}
