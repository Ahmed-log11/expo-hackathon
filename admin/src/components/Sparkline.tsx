const W = 76;
const H = 26;
const PAD = 5;

/**
 * The model's expected wait now, +30, +60, +90 as one small line. All rows share one y-scale
 * (0..yMax) so a spiked pavilion stands out. Time runs in reading direction, like the ledger columns.
 */
export function Sparkline({ values, yMax, rtl }: { values: number[]; yMax: number; rtl: boolean }) {
  const n = values.length;
  const x = (i: number) => {
    const v = PAD + (i * (W - 2 * PAD)) / Math.max(1, n - 1);
    return rtl ? W - v : v;
  };
  const y = (v: number) => H - PAD - (Math.min(v, yMax) / yMax) * (H - 2 * PAD);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const base = (H - PAD).toFixed(1);
  const area = `M${x(0).toFixed(1)},${base} L${pts.join(' L')} L${x(n - 1).toFixed(1)},${base} Z`;
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={area} className="spark-area" />
      <polyline points={pts.join(' ')} className="spark-line" />
      <circle cx={x(n - 1)} cy={y(values[n - 1])} r={4} className="spark-dot" />
    </svg>
  );
}
