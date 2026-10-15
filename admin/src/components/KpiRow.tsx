import type { AdminStats, Crowd } from '../api';
import { fmt, sum } from '../format';
import { t } from '../strings';

/** Headline numbers: one hero figure (minutes saved, the value for operators), then three stat tiles. */
export function KpiRow({ stats, crowd }: { stats?: AdminStats; crowd?: Crowd }) {
  const dash = '—';
  const waits = crowd?.pavilions ?? [];
  const avgWait = stats ? stats.avg_wait_min : waits.length ? sum(waits.map((p) => p.wait_min)) / waits.length : null;

  return (
    <section className="kpis" aria-label="KPIs">
      <article className="kpi hero">
        <h3>{t('kpiSaved')}</h3>
        <p className="kpi-value">
          {stats ? fmt(stats.saved_min_total) : dash}
          {stats && <span className="kpi-unit">{t('kpiUnit')}</span>}
        </p>
      </article>

      <article className="kpi">
        <h3>{t('kpiActive')}</h3>
        <p className="kpi-value">{stats ? fmt(stats.visitors.active) : dash}</p>
      </article>

      <article className="kpi">
        <h3>{t('kpiOffers')}</h3>
        <p className="kpi-value">{stats ? fmt(stats.offers.sent) : dash}</p>
        <p className="kpi-sub">{stats ? t('kpiOffersSub', { acc: fmt(stats.offers.accepted) }) : ' '}</p>
      </article>

      <article className="kpi">
        <h3>{t('kpiWait')}</h3>
        <p className="kpi-value">
          {avgWait === null ? dash : fmt(avgWait)}
          {avgWait !== null && <span className="kpi-unit">{t('kpiUnit')}</span>}
        </p>
      </article>
    </section>
  );
}
