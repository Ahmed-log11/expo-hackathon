import type { AdminStats, ForecastPoint, PavilionCrowd, Place } from '../api';
import { fmt, hhmm, sum } from '../format';
import { HEAT_FLOOR, heatFill } from '../heat';
import { t } from '../strings';
import { Sparkline } from './Sparkline';
import { StatusPill } from './Status';

const BUCKETS = 8;

/**
 * One row per pavilion, three column groups that line up:
 *   Now (GET /crowd) | Model forecast (GET /pavilions/{id}/forecast) | Ledger (GET /admin/stats)
 * so "Japan is red now" and "here's who we're sending there next" read on the same line.
 */
export function PavilionTable({ pavilions, crowd, stats, forecasts }: {
  pavilions: Place[];
  crowd: Record<string, PavilionCrowd>;
  stats?: AdminStats;
  forecasts: Record<string, ForecastPoint[]>;
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
                <tr key={p.id}>
                  <td className="name">{p.name_ar}</td>
                  <td>{c ? <StatusPill status={c.status} wait={c.wait_min} /> : <span className="muted">…</span>}</td>
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
