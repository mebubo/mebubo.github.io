import { useState, useMemo, useEffect } from "react";
import { parse, extractVariables } from "./formula";
import { type Distribution, DISTRIBUTION_TYPES, defaultDistribution, sampleMany } from "./distributions";
import { simulate, type SimulationResult } from "./simulate";

function formatNum(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e6 || abs < 0.01) return n.toExponential(2);
  if (Number.isInteger(n) && abs < 1e6) return n.toLocaleString();
  return n.toPrecision(4);
}

function toLogSafe(v: number): number {
  return Math.log10(Math.max(Math.abs(v), 1e-10));
}

function fromLog(logVal: number): number {
  return parseFloat(Math.pow(10, logVal).toPrecision(3));
}

function DistributionPreview({ dist }: { dist: Distribution }) {
  const distKey = JSON.stringify(dist);
  const data = useMemo(() => {
    const raw = sampleMany(dist, 3000).filter(isFinite).sort((a, b) => a - b);
    if (raw.length < 10) return null;
    const lo = raw[Math.floor(raw.length * 0.01)];
    const hi = raw[Math.floor(raw.length * 0.99)];
    const binCount = 40;
    const width = (hi - lo) / binCount;
    if (width <= 0) return null;
    const bins = new Array(binCount).fill(0);
    for (const s of raw) {
      if (s >= lo && s <= hi) {
        bins[Math.min(Math.floor((s - lo) / width), binCount - 1)]++;
      }
    }
    return { bins, lo, hi };
  }, [distKey]);

  if (!data) return null;
  const maxBin = Math.max(...data.bins);
  const W = 200;
  const H = 48;
  const barW = W / data.bins.length;

  return (
    <svg className="dist-preview" viewBox={`0 0 ${W} ${H + 14}`}>
      {data.bins.map((count, i) => {
        const barH = maxBin > 0 ? (count / maxBin) * H : 0;
        return (
          <rect
            key={i}
            x={i * barW}
            y={H - barH}
            width={Math.max(barW - 0.3, 0.3)}
            height={barH}
            fill="#5b8fb9"
            opacity={0.5}
          />
        );
      })}
      <text x={0} y={H + 12} fontSize={9} fill="#999">{formatNum(data.lo)}</text>
      <text x={W} y={H + 12} fontSize={9} fill="#999" textAnchor="end">{formatNum(data.hi)}</text>
    </svg>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  // Log-scale slider with fixed range computed once at mount
  const [logRange] = useState(() => {
    const log = toLogSafe(value);
    const center = Math.round(log * 2) / 2;
    return [center - 2.5, center + 2.5] as const;
  });

  const logValue = toLogSafe(value);
  const clampedLog = Math.max(logRange[0], Math.min(logRange[1], logValue));

  return (
    <label className="field">
      <div className="field-header">
        <span>{label}</span>
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
        />
      </div>
      <input
        className="slider"
        type="range"
        min={logRange[0]}
        max={logRange[1]}
        step={0.01}
        value={clampedLog}
        onChange={(e) => onChange(fromLog(parseFloat(e.target.value)))}
      />
    </label>
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
      case "uniform":    return onChange({ type: "uniform", min: 0, max: 100 });
      case "gaussian":   return onChange({ type: "gaussian", mean: 50, stddev: 10 });
      case "lognormal":  return onChange({ type: "lognormal", low: 10, high: 1000 });
      case "poisson":    return onChange({ type: "poisson", lambda: 10 });
    }
  };

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
      <div className="parameter-body">
        <div className="parameter-fields">
          {dist.type === "uniform" && (
            <>
              <Field label="min" value={dist.min} onChange={(v) => onChange({ ...dist, min: v })} />
              <Field label="max" value={dist.max} onChange={(v) => onChange({ ...dist, max: v })} />
            </>
          )}
          {dist.type === "gaussian" && (
            <>
              <Field label="μ" value={dist.mean} onChange={(v) => onChange({ ...dist, mean: v })} />
              <Field label="σ" value={dist.stddev} onChange={(v) => onChange({ ...dist, stddev: v })} />
            </>
          )}
          {dist.type === "lognormal" && (
            <>
              <Field label="low (P10)" value={dist.low} onChange={(v) => onChange({ ...dist, low: v })} />
              <Field label="high (P90)" value={dist.high} onChange={(v) => onChange({ ...dist, high: v })} />
            </>
          )}
          {dist.type === "poisson" && (
            <Field label="λ" value={dist.lambda} onChange={(v) => onChange({ ...dist, lambda: v })} />
          )}
        </div>
        <DistributionPreview dist={dist} />
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
