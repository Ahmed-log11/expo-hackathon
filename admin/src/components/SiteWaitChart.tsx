import { useEffect, useMemo, useRef, useState } from 'react';
import type { History } from '../api';
import { fmt, hhmm } from '../format';
import { t } from '../strings';

const H = 200;
const PAD = { top: 22, bottom: 26, side: 34, end: 12 };   // side = the y labels (right, RTL)
// The page is RTL, so in SVG text-anchor "start" is the text's right edge and "end" its left edge.
const PAST_MIN = 120;
const AHEAD_MIN = 90;

interface Pt { m: number; v: number; at: string; kind: 'measured' | 'estimated' | 'forecast' }

/** Width of the element, kept in sync on resize (the SVG is drawn in real pixels so text never stretches). */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/**
 * The site's average wait: the last 2 hours (solid; dotted where it was estimated after a server
 * restart), then the model's forecast for 90 minutes (dashed). Time runs right to left, like the
 * table. Hover for the exact value at any time.
 */
export function SiteWaitChart({ history }: { history?: History }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Pt | null>(null);

  const pts = useMemo<Pt[]>(() => {
    if (!history) return [];
    const now = Date.parse(history.as_of);
    const past: Pt[] = history.points.map((p) => ({
      m: (Date.parse(p.at) - now) / 60_000, v: p.avg_wait_min, at: p.at, kind: p.estimated ? 'estimated' : 'measured',
    }));
    const ahead: Pt[] = history.forecast.map((f) => ({ m: f.minutes, v: f.avg_wait_min, at: f.at, kind: 'forecast' }));
    return [...past.filter((p) => p.m >= -PAST_MIN && p.m <= 0), ...ahead];
  }, [history]);

  const yMax = Math.max(40, Math.ceil(Math.max(0, ...pts.map((p) => p.v)) / 10) * 10 + 10);
  const plotW = Math.max(0, width - PAD.side - PAD.end);
  // RTL: the past on the right, the future on the left.
  const x = (m: number) => PAD.end + ((AHEAD_MIN - m) / (AHEAD_MIN + PAST_MIN)) * plotW;
  const y = (v: number) => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom);
  const path = (list: Pt[]) => list.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

  // Split the past into runs of measured / estimated so each draws in its own style; runs touch.
  const runs: { kind: Pt['kind']; pts: Pt[] }[] = [];
  for (const p of pts.filter((q) => q.kind !== 'forecast')) {
    const last = runs[runs.length - 1];
    if (last && last.kind === p.kind) last.pts.push(p);
    else runs.push({ kind: p.kind, pts: last ? [last.pts[last.pts.length - 1], p] : [p] });
  }
  const forecast = pts.filter((p) => p.kind === 'forecast');
  const nowPt = forecast[0];
  const endPt = forecast[forecast.length - 1];
  const ticks = Array.from({ length: Math.floor(yMax / 20) + 1 }, (_, i) => i * 20);
  const xTicks = [-120, -60, 0, 60];
  const hasEstimated = pts.some((p) => p.kind === 'estimated');

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + PAD.end;
    const m = AHEAD_MIN - ((px - PAD.end) / plotW) * (AHEAD_MIN + PAST_MIN);
    let best: Pt | null = null;
    for (const p of pts) if (!best || Math.abs(p.m - m) < Math.abs(best.m - m)) best = p;
    setHover(best);
  };

  const tickTime = (m: number) => {
    if (!history) return '';
    const d = new Date(Date.parse(history.as_of) + m * 60_000);
    return hhmm(new Date(d.getTime() + 3 * 3600_000).toISOString());   // Riyadh clock, any viewer timezone
  };

  return (
    <section className="card chart-card" aria-labelledby="chart-title">
      <div className="chart-head">
        <div>
          <h2 id="chart-title">{t('chartTitle')}</h2>
          <p className="muted">{t('chartSub')}</p>
        </div>
        <ul className="chart-key" aria-label="key">
          <li><svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" className="ln measured" /></svg>{t('chartMeasured')}</li>
          {hasEstimated && <li><svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" className="ln estimated" /></svg>{t('chartEstimated')}</li>}
          <li><svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" className="ln forecast" /></svg>{t('chartForecast')}</li>
        </ul>
      </div>

      <div ref={ref} className="chart-box">
        {width > 0 && pts.length > 0 && (
          <svg width={width} height={H} role="img" aria-label={nowPt ? t('chartNowValue', { n: fmt(nowPt.v) }) : t('chartTitle')}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.end} x2={width - PAD.side} y1={y(v)} y2={y(v)} className="grid" />
                <text x={width - PAD.side + 6} y={y(v)} className="axis" dominantBaseline="middle" textAnchor="end">{v}</text>
              </g>
            ))}
            {xTicks.map((m) => (
              <text key={m} x={x(m)} y={H - 8} className="axis" textAnchor="middle">
                {m === 0 ? t('chartNow') : tickTime(m)}
              </text>
            ))}
            <line x1={x(0)} x2={x(0)} y1={PAD.top - 6} y2={H - PAD.bottom} className="now-line" />

            {runs.map((r, i) => <path key={i} d={path(r.pts)} className={`ln ${r.kind}`} />)}
            {forecast.length > 1 && <path d={path(forecast)} className="ln forecast" />}

            {nowPt && (
              <g>
                <circle cx={x(0)} cy={y(nowPt.v)} r={5} className="dot" />
                <text x={x(0) - 9} y={y(nowPt.v) - 10} className="val" textAnchor="start">{t('chartNowValue', { n: fmt(nowPt.v) })}</text>
              </g>
            )}
            {endPt && endPt !== nowPt && (
              <text x={x(endPt.m)} y={y(endPt.v) - 10} className="val muted-val" textAnchor="end">
                {t('chartIn', { m: endPt.m })}: {fmt(endPt.v)}
              </text>
            )}

            {hover && (
              <g pointerEvents="none">
                <line x1={x(hover.m)} x2={x(hover.m)} y1={PAD.top} y2={H - PAD.bottom} className="cross" />
                <circle cx={x(hover.m)} cy={y(hover.v)} r={4.5} className="dot" />
              </g>
            )}
            <rect
              x={PAD.end} y={0} width={plotW} height={H}
              fill="transparent"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hover && (
          <div
            className="chart-tip"
            style={{ left: Math.min(Math.max(x(hover.m), 70), width - 70), top: Math.max(y(hover.v) - 56, 0) }}
          >
            <strong>{t('chartTip', { time: hhmm(hover.at), n: fmt(hover.v) })}</strong>
            <span>{t(hover.kind === 'forecast' ? 'chartForecast' : hover.kind === 'estimated' ? 'chartEstimated' : 'chartMeasured')}</span>
          </div>
        )}
        {!pts.length && <p className="muted chart-empty">{t('connecting')}</p>}
      </div>
    </section>
  );
}
