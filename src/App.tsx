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

const GW = 300, GH = 52, AH = 16;

function DistributionGraph({ dist }: { dist: Distribution }) {
  const W = GW, totalH = GH + AH;

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
    const lambdaX = Math.min((dist.lambda / kMax) * W, W - 1);
    return (
      <svg className="dist-graph" viewBox={`0 0 ${W} ${totalH}`} preserveAspectRatio="none">
        {bars.map((p, k) => {
          const h = (p / maxP) * GH;
          return <rect key={k} x={k * barW + 0.5} y={GH - h} width={Math.max(barW - 1, 0.5)} height={h} fill="#5b8fb9" opacity={0.7} />;
        })}
        <line x1={0} y1={GH} x2={W} y2={GH} stroke="#ddd" strokeWidth={0.5} />
        <line x1={1} y1={GH} x2={1} y2={GH + 3} stroke="#aaa" strokeWidth={0.5} />
        <line x1={lambdaX} y1={GH} x2={lambdaX} y2={GH + 3} stroke="#aaa" strokeWidth={0.5} />
        <line x1={W - 1} y1={GH} x2={W - 1} y2={GH + 3} stroke="#aaa" strokeWidth={0.5} />
        <text x={1} y={totalH - 2} fontSize={9} fill="#888" textAnchor="start">0</text>
        <text x={lambdaX} y={totalH - 2} fontSize={9} fill="#888" textAnchor="middle">{formatNum(dist.lambda)}</text>
        <text x={W - 1} y={totalH - 2} fontSize={9} fill="#888" textAnchor="end">{kMax}</text>
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
  const sy = (y: number) => GH - (y / maxY) * GH * 0.95;

  const linePts = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  const fillPath = `${linePts} L${sx(pts[pts.length - 1][0]).toFixed(1)},${GH} L${sx(pts[0][0]).toFixed(1)},${GH} Z`;

  type Tick = { x: number; label: string; anchor: "start" | "middle" | "end" };
  let ticks: Tick[] = [];

  if (dist.type === "uniform") {
    ticks = [
      { x: dist.min, label: formatNum(dist.min), anchor: "middle" },
      { x: dist.max, label: formatNum(dist.max), anchor: "middle" },
    ];
  } else if (dist.type === "gaussian") {
    const s = Math.abs(dist.stddev) || 1;
    ticks = [
      { x: xMin, label: formatNum(dist.mean - 3 * s), anchor: "start" },
      { x: dist.mean, label: formatNum(dist.mean), anchor: "middle" },
      { x: xMax, label: formatNum(dist.mean + 3 * s), anchor: "end" },
    ];
  } else {
    // lognormal — mark P10 and P90
    ticks = [
      { x: dist.low,  label: formatNum(dist.low),  anchor: "middle" },
      { x: dist.high, label: formatNum(dist.high), anchor: "middle" },
    ];
  }

  return (
    <svg className="dist-graph" viewBox={`0 0 ${W} ${totalH}`} preserveAspectRatio="none">
      <path d={fillPath} fill="#5b8fb9" opacity={0.2} />
      <path d={linePts} fill="none" stroke="#5b8fb9" strokeWidth={1.5} />
      <line x1={0} y1={GH} x2={W} y2={GH} stroke="#ddd" strokeWidth={0.5} />
      {ticks.map((tick, i) => {
        const tx = Math.max(1, Math.min(W - 1, sx(tick.x)));
        return (
          <g key={i}>
            <line x1={tx} y1={GH} x2={tx} y2={GH + 3} stroke="#aaa" strokeWidth={0.5} />
            <text x={tx} y={totalH - 2} fontSize={9} fill="#888" textAnchor={tick.anchor}>{tick.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

type BoundEntry = { range: [number, number]; log?: boolean };

function getSliderBounds(dist: Distribution): Record<string, BoundEntry> {
  switch (dist.type) {
    case "uniform": {
      const span = Math.max(dist.max - dist.min, 1);
      return {
        min: { range: [dist.min - span, dist.min + span * 2] },
        max: { range: [dist.max - span * 2, dist.max + span] },
      };
    }
    case "gaussian": {
      const s = Math.max(Math.abs(dist.stddev), 1);
      return {
        mean:   { range: [dist.mean - s * 4, dist.mean + s * 4] },
        stddev: { range: [s * 0.05, s * 4] },
      };
    }
    case "lognormal": {
      const lo = Math.max(dist.low, 1e-3);
      const hi = Math.max(dist.high, lo * 1.1);
      return {
        low:  { range: [lo * 0.1,  hi * 3],  log: true },
        high: { range: [lo * 0.3,  hi * 10], log: true },
      };
    }
    case "poisson":
      return { lambda: { range: [0.1, Math.max(dist.lambda * 4, 20)], log: true } };
  }
}

function Field({
  label,
  value,
  onChange,
  sliderMin = 0,
  sliderMax = 100,
  logScale = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  sliderMin?: number;
  sliderMax?: number;
  logScale?: boolean;
}) {
  const safeMin = logScale ? Math.log10(Math.max(sliderMin, 1e-10)) : sliderMin;
  const safeMax = logScale ? Math.log10(Math.max(sliderMax, 1e-9)) : sliderMax;
  const sliderVal = logScale
    ? Math.log10(Math.max(value, 1e-10))
    : Math.min(Math.max(value, sliderMin), sliderMax);
  const step = (safeMax - safeMin) / 500;

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="field-controls">
        <input
          type="range"
          min={safeMin}
          max={safeMax}
          step={step}
          value={Math.min(Math.max(sliderVal, safeMin), safeMax)}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(logScale ? Math.pow(10, v) : v);
          }}
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
            <Field label="min" value={dist.min} onChange={(v) => onChange({ ...dist, min: v })} sliderMin={bounds.min.range[0]} sliderMax={bounds.min.range[1]} logScale={bounds.min.log} />
            <Field label="max" value={dist.max} onChange={(v) => onChange({ ...dist, max: v })} sliderMin={bounds.max.range[0]} sliderMax={bounds.max.range[1]} logScale={bounds.max.log} />
          </>
        )}
        {dist.type === "gaussian" && (
          <>
            <Field label="μ" value={dist.mean} onChange={(v) => onChange({ ...dist, mean: v })} sliderMin={bounds.mean.range[0]} sliderMax={bounds.mean.range[1]} logScale={bounds.mean.log} />
            <Field label="σ" value={dist.stddev} onChange={(v) => onChange({ ...dist, stddev: v })} sliderMin={bounds.stddev.range[0]} sliderMax={bounds.stddev.range[1]} logScale={bounds.stddev.log} />
          </>
        )}
        {dist.type === "lognormal" && (
          <>
            <Field label="low (P10)" value={dist.low} onChange={(v) => onChange({ ...dist, low: v })} sliderMin={bounds.low.range[0]} sliderMax={bounds.low.range[1]} logScale={bounds.low.log} />
            <Field label="high (P90)" value={dist.high} onChange={(v) => onChange({ ...dist, high: v })} sliderMin={bounds.high.range[0]} sliderMax={bounds.high.range[1]} logScale={bounds.high.log} />
          </>
        )}
        {dist.type === "poisson" && (
          <Field label="λ" value={dist.lambda} onChange={(v) => onChange({ ...dist, lambda: v })} sliderMin={bounds.lambda.range[0]} sliderMax={bounds.lambda.range[1]} logScale={bounds.lambda.log} />
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
