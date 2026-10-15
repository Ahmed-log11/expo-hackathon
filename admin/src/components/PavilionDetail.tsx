import { useEffect, useMemo, useRef } from 'react';
import { api, type District, type PavilionDetail as Detail } from '../api';
import { fmt, hhmm } from '../format';
import { HEAT_FLOOR, heatFill } from '../heat';
import { usePoll } from '../hooks';
import { t } from '../strings';
import { EventList } from './Alerts';
import { StatusPill } from './Status';
import { WaitChart, WaitChartKey, type WaitSeries, hasEstimated } from './WaitChart';

const DETAIL_MS = 10_000;

/**
 * Side panel for one pavilion (click a table row, a map dot or an alert): status and the numbers
 * behind it, its own wait chart (last 2 h + forecast), who the ledger is sending there, and its
 * recent alerts. Esc, the ✕ or a click outside closes it.
 */
export function PavilionDetail({ pid, districts, names, bump, onClose, onSelect }: {
  pid: string;
  districts: District[];
  names: Record<string, string>;
  bump: number;
  onClose: () => void;
  onSelect: (pid: string) => void;
}) {
  const fetcher = useMemo(() => () => api.pavilion(pid), [pid]);
  const [detail, refresh] = usePoll<Detail>(fetcher, DETAIL_MS);
  const d = detail.data?.pavilion.id === pid ? detail.data : undefined;   // never show the previous pavilion

  useEffect(() => { refresh(); }, [pid, bump, refresh]);

  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const series = useMemo<WaitSeries | undefined>(() => d && {
    as_of: d.as_of,
    points: d.points.map((p) => ({ at: p.at, value: p.wait_min, estimated: p.estimated })),
    forecast: d.forecast.map((f) => ({ minutes: f.minutes, at: f.at, value: f.wait_min })),
  }, [d]);

  const district = districts.find((x) => x.id === d?.pavilion.district);
  const change = d && d.wait_before_min != null ? d.wait_min - d.wait_before_min : null;
  const heatMax = Math.max(HEAT_FLOOR, ...(d?.routed_next_2h ?? []));

  return (
    <div className="drawer-wrap" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <header className="drawer-head">
          <div>
            <h2 id="detail-title">{d?.pavilion.name_ar ?? names[pid] ?? pid}</h2>
            {d && (
              <p className="muted">
                {district?.name_ar ?? d.pavilion.district}
                {' · '}{t(d.pavilion.indoor ? 'detailIndoor' : 'detailOutdoor')}
                {' · '}{t('detailVisit', { n: d.pavilion.avg_visit_min })}
                {' · '}{t('detailPopularity', { n: d.pavilion.popularity })}
              </p>
            )}
          </div>
          <button ref={closeRef} type="button" className="icon-btn dark" onClick={onClose} aria-label={t('detailClose')}>×</button>
        </header>

        {!d && <p className="muted drawer-loading">{detail.error ? t('aiError') : t('connecting')}</p>}

        {d && (
          <div className="drawer-body">
            <div className="detail-status">
              <StatusPill status={d.status} wait={d.wait_min} />
              {change != null && d.compare_minutes_ago != null && Math.abs(change) >= 1 && (
                <span className={`trend ${change > 0 ? 'up' : 'down'}`}>
                  {t('detailVsBefore', { sign: change > 0 ? '+' : '−', n: Math.abs(change), m: d.compare_minutes_ago })}
                  {d.compare_estimated ? t('trendEst') : ''}
                </span>
              )}
            </div>
            {d.reported && (
              <p className="detail-report">{t('detailReported', { time: hhmm(d.reported.at), n: fmt(d.reported.wait_min) })}</p>
            )}

            <dl className="detail-stats">
              <div><dt>{t('detailWait')}</dt><dd>{fmt(d.wait_min)} <small>{t('kpiUnit')}</small></dd></div>
              <div><dt>{t('detailNormal')}</dt><dd>{fmt(d.normal_wait_min)} <small>{t('kpiUnit')}</small></dd></div>
              <div><dt>{t('detailQueue')}</dt><dd>{fmt(d.queue_length)}</dd></div>
              <div><dt>{t('detailCapacity')}</dt><dd>{fmt(d.pavilion.capacity_per_hour)}</dd></div>
            </dl>

            <section className="detail-sec">
              <div className="chart-head">
                <h3>{t('detailChart')}</h3>
                <WaitChartKey estimated={hasEstimated(series)} />
              </div>
              <WaitChart series={series} height={170} label={d.pavilion.name_ar} />
            </section>

            <section className="detail-sec">
              <div className="chart-head">
                <h3>{t('detailLedger')}</h3>
                <span className={d.routed_load_pct >= 80 ? 'trend up' : 'muted'}>{t('detailLoad', { pct: d.routed_load_pct })}</span>
              </div>
              <div className="detail-ledger">
                {d.routed_next_2h.map((v, i) => {
                  const fill = heatFill(v, heatMax);
                  return (
                    <div key={i} className="dl-col">
                      <span className="cell" style={fill ? { background: fill.bg, color: fill.fg } : undefined}>{v > 0 ? v : ''}</span>
                      <small className="muted num">{hhmm(d.buckets[i])}</small>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="detail-sec">
              <h3>{t('detailEvents')}</h3>
              {d.events.length
                ? <EventList events={d.events} names={names} onSelect={(p) => p !== pid && onSelect(p)} />
                : <p className="muted">{t('detailNoEvents')}</p>}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
