import type { AdminStats, ForecastPoint, History, PavilionCrowd, Place, Trend } from '../api';
import { fmt, hhmm, sum } from '../format';
import { HEAT_FLOOR, heatFill } from '../heat';
import { t } from '../strings';
import { Sparkline } from './Sparkline';
import { StatusPill } from './Status';

const BUCKETS = 8;
const TREND_MIN = 5;   // smaller changes in wait are noise: no arrow

/** ▲ / ▼ and the minutes the wait moved since 30 minutes ago (arrow + number, never colour alone). */
function TrendTag({ trend, history }: { trend?: Trend; history?: History }) {
  const d = trend?.change_min;
  if (d == null || Math.abs(d) < TREND_MIN || !history?.compare_minutes_ago) return null;
  const vars = { n: Math.abs(d), m: history.compare_minutes_ago };
  const tip = t(d > 0 ? 'trendUp' : 'trendDown', vars) + (history.compare_estimated ? t('trendEst') : '');
  return (
    <span className={`trend ${d > 0 ? 'up' : 'down'}`} title={tip} aria-label={tip}>
      {d > 0 ? '▲' : '▼'}{Math.abs(d)}
    </span>
  );
}

/**
 * One row per pavilion, three column groups that line up:
 *   Now (GET /crowd) | Model forecast (GET /pavilions/{id}/forecast) | Ledger (GET /admin/stats)
 * so "Japan is red now" and "here's who we're sending there next" read on the same line.
 */
export function PavilionTable({ pavilions, crowd, stats, forecasts, history, onSelect }: {
  pavilions: Place[];
  crowd: Record<string, PavilionCrowd>;
  stats?: AdminStats;
  forecasts: Record<string, ForecastPoint[]>;
  /** GET /admin/history: the trend arrow next to each wait. */
  history?: History;
  /** Opens the pavilion's detail panel. */
  onSelect: (pid: string) => void;
}) {
  const routed: Record<string, number[]> = {};
  for (const p of stats?.pavilions ?? []) routed[p.pavilion_id] = p.routed_next_2h;
  const buckets = stats?.buckets ?? [];
  const heatMax = Math.max(HEAT_FLOOR, ...Object.values(routed).flat());
  const yMax = Math.max(60, ...Object.values(forecasts).flat().map((f) => f.wait_min));

  return (
    <section className="card">
      <div className="table-scroll">
        <table className="ptable">
          <colgroup>
            <col className="c-name" />
            <col className="c-wait" />
            <col className="c-queue" />
            <col className="c-fc" />
            {Array.from({ length: BUCKETS }, (_, i) => <col key={i} />)}
            <col className="c-total" />
          </colgroup>
          <thead>
            <tr className="groups">
              <th />
              <th colSpan={2}>{t('groupNow')}</th>
              <th>{t('groupForecast')} <span className="badge">ML</span></th>
              <th colSpan={BUCKETS + 1} className="g-ledger gs">{t('groupLedger')}</th>
            </tr>
            <tr className="cols">
              <th>{t('colPavilion')}</th>
              <th>{t('colWait')}</th>
              <th className="num">{t('colQueue')}</th>
              <th>{t('colForecast')}</th>
              {Array.from({ length: BUCKETS }, (_, i) => (
                <th key={i} className={i === 0 ? 'heat-h num gs' : 'heat-h num'}>{buckets[i] ? hhmm(buckets[i]) : '—'}</th>
              ))}
              <th className="num">{t('colTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {pavilions.map((p) => {
              const c = crowd[p.id];
              const cells = routed[p.id] ?? [];
              const fc = forecasts[p.id]?.map((f) => f.wait_min);
              return (
                <tr key={p.id} className="clickable" onClick={() => onSelect(p.id)} title={t('openDetail')}>
                  <td className="name">
                    <button type="button" className="row-link" onClick={(e) => { e.stopPropagation(); onSelect(p.id); }}>{p.name_ar}</button>
                  </td>
                  <td>{c ? (
                    <span className="wait-cell">
                      <StatusPill status={c.status} wait={c.wait_min} />
                      <TrendTag trend={history?.trend[p.id]} history={history} />
                    </span>
                  ) : <span className="muted">…</span>}</td>
                  <td className="num">{c ? fmt(c.queue_length) : ''}</td>
                  <td title={fc ? t('forecastTip', { a: fc[0], b: fc[1], c: fc[2], d: fc[3] }) : undefined}>
                    {fc ? (
                      <span className="fc-wrap">
                        <Sparkline values={fc} yMax={yMax} />
                        <span className="fc-end num">{fmt(fc[fc.length - 1])}</span>
                      </span>
                    ) : <span className="muted">…</span>}
                  </td>
                  {Array.from({ length: BUCKETS }, (_, i) => {
                    const v = cells[i] ?? 0;
                    const fill = heatFill(v, heatMax);
                    return (
                      <td key={i} className={i === 0 ? 'heat gs' : 'heat'}>
                        <span className="cell" style={fill ? { background: fill.bg, color: fill.fg } : undefined}>
                          {v > 0 ? v : ''}
                        </span>
                      </td>
                    );
                  })}
                  <td className="num total">{stats ? fmt(sum(cells)) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
