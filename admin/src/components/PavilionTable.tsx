import { useEffect, useRef, useState } from 'react';
import type { AdminStats, ForecastPoint, PavilionCrowd, Place, Status } from '../api';
import { addMinutes, fmt, hhmm, sum } from '../format';
import { HEAT_FLOOR, heatFill, heatGradient } from '../heat';
import { useI18n } from '../i18n';
import { StatusLegend, StatusPill } from './Status';
import { Sparkline } from './Sparkline';
import { useTip } from './Tooltip';

const BUCKETS = 8;

/**
 * One row per pavilion, three column groups that line up:
 *   Now (GET /crowd) | Model forecast (GET /pavilions/{id}/forecast) | Ledger (GET /admin/stats)
 * so "Japan is red now" and "here's who we're sending there next" read on the same line.
 */
export function PavilionTable({ pavilions, crowd, stats, forecasts, selected, onSelect }: {
  pavilions: Place[];
  crowd: Record<string, PavilionCrowd>;
  stats?: AdminStats;
  forecasts: Record<string, ForecastPoint[]>;
  selected: string | null;
  onSelect: (pid: string) => void;
}) {
  const { t, name, rtl } = useI18n();
  const tip = useTip();

  // Flash a row when its status changes (e.g. a spike turns it red).
  const prev = useRef<Record<string, Status>>({});
  const [flash, setFlash] = useState<Record<string, number>>({});
  useEffect(() => {
    const changed: Record<string, number> = {};
    for (const c of Object.values(crowd)) {
      const before = prev.current[c.pavilion_id];
      if (before && before !== c.status) changed[c.pavilion_id] = Date.now();
      prev.current[c.pavilion_id] = c.status;
    }
    if (Object.keys(changed).length) setFlash((f) => ({ ...f, ...changed }));
  }, [crowd]);

  const routed: Record<string, number[]> = {};
  for (const p of stats?.pavilions ?? []) routed[p.pavilion_id] = p.routed_next_2h;
  const buckets = stats?.buckets ?? [];
  const bucketMin = stats?.bucket_min ?? 15;
  const heatMax = Math.max(HEAT_FLOOR, ...Object.values(routed).flat());
  const yMax = Math.max(60, ...Object.values(forecasts).flat().map((f) => f.wait_min));

  return (
    <section className="card table-card">
      <header className="card-head">
        <h2>{t('tablePavilions')}</h2>
        <div className="legends">
          <StatusLegend />
          <div className="heat-legend">
            <span className="num">1</span>
            <i style={{ background: heatGradient(rtl) }} aria-hidden="true" />
            <span className="num">{fmt(heatMax)}</span>
            <span>{t('heatLegend')}</span>
          </div>
        </div>
      </header>

      <div className="table-scroll">
        <table className="ptable">
          <colgroup>
            <col className="c-name" />
            <col className="c-wait" />
            <col className="c-queue" />
            <col className="c-fc" />
            {Array.from({ length: BUCKETS }, (_, i) => <col key={i} className="c-heat" />)}
            <col className="c-total" />
          </colgroup>
          <thead>
            <tr className="groups">
              <th />
              <th colSpan={2} className="g-now">{t('groupNow')}</th>
              <th className="g-model">{t('groupForecast')} <span className="badge">ML</span></th>
              <th colSpan={BUCKETS + 1} className="g-ledger gs">{t('groupLedger')}</th>
            </tr>
            <tr className="cols">
              <th className="start">{t('colPavilion')}</th>
              <th className="start">{t('colWait')}</th>
              <th className="num">{t('colQueue')}</th>
              <th className="start">{t('colForecast')}</th>
              {Array.from({ length: BUCKETS }, (_, i) => (
                <th key={i} className={i === 0 ? 'heat-h num gs' : 'heat-h num'}>{buckets[i] ? hhmm(buckets[i]) : '—'}</th>
              ))}
              <th className="num total">{t('colTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {pavilions.map((p) => {
              const c = crowd[p.id];
              const fc = forecasts[p.id];
              const cells = routed[p.id] ?? [];
              const label = name(p, p.id);
              const flashKey = flash[p.id] ?? 0;
              const fcVals = fc?.map((f) => f.wait_min);
              const trend = fcVals ? fcVals[fcVals.length - 1] - fcVals[0] : 0;
              return (
                <tr
                  key={`${p.id}:${flashKey}`}
                  className={[selected === p.id ? 'sel' : '', flashKey && c ? `flash-${c.status}` : ''].join(' ')}
                  onClick={() => onSelect(p.id)}
                >
                  <td className="name" title={name(p) === p.name_ar ? p.name_en : p.name_ar}>{label}</td>
                  <td>{c ? <StatusPill status={c.status} wait={c.wait_min} /> : <span className="muted">…</span>}</td>
                  <td className="num">{c ? fmt(c.queue_length) : ''}</td>
                  <td
                    className="fc"
                    onPointerMove={fcVals ? (e) => tip.show(e, {
                      value: t('forecastTip', { a: fcVals[0], b: fcVals[1], c: fcVals[2], d: fcVals[3] }),
                      label: `${label} · ${t('detailForecast')}`,
                    }) : undefined}
                    onPointerLeave={tip.hide}
                  >
                    {fcVals ? (
                      <span className="fc-wrap">
                        <Sparkline values={fcVals} yMax={yMax} rtl={rtl} />
                        <span className="fc-end num">{fmt(fcVals[fcVals.length - 1])}</span>
                        <span className="fc-trend" aria-hidden="true">{trend >= 3 ? '↑' : trend <= -3 ? '↓' : ''}</span>
                      </span>
                    ) : <span className="muted">…</span>}
                  </td>
                  {Array.from({ length: BUCKETS }, (_, i) => {
                    const v = cells[i] ?? 0;
                    const fill = heatFill(v, heatMax);
                    const from = buckets[i] ? hhmm(buckets[i]) : '';
                    return (
                      <td
                        key={i}
                        className={i === 0 ? 'heat gs' : 'heat'}
                        onPointerMove={stats ? (e) => tip.show(e, {
                          value: t('cellTip', { n: v }),
                          label: `${label} · ${from}–${addMinutes(from, bucketMin)}`,
                        }) : undefined}
                        onPointerLeave={tip.hide}
                      >
                        <span className={fill ? 'cell on' : 'cell'} style={fill ? { background: fill.bg, color: fill.fg } : undefined}>
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
      <p className="ledger-hint">{t('ledgerHint')}</p>
    </section>
  );
}
