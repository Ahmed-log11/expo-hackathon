import type { AdminStats, Crowd, Place } from '../api';
import { fmt, sum } from '../format';
import { useI18n } from '../i18n';

/** Headline numbers: one hero figure (minutes saved, the value for operators), then four stat tiles. */
export function KpiRow({ stats, crowd, pavilions }: {
  stats?: AdminStats;
  crowd?: Crowd;
  pavilions: Place[];
}) {
  const { t, name } = useI18n();
  const dash = '—';

  const routedTotals = stats?.pavilions.map((p) => sum(p.routed_next_2h)) ?? [];
  const booked = sum(routedTotals);
  const spread = routedTotals.filter((n) => n > 0).length;

  const waits = crowd?.pavilions ?? [];
  const avgWait = stats ? stats.avg_wait_min : waits.length ? sum(waits.map((p) => p.wait_min)) / waits.length : null;
  const longest = waits.length ? waits.reduce((a, b) => (b.wait_min > a.wait_min ? b : a)) : null;
  const longestName = longest ? name(pavilions.find((p) => p.id === longest.pavilion_id), longest.pavilion_id) : '';

  const saved = stats?.saved_min_total ?? null;
  const fromReroutes = stats?.offers.accepted_saved_min ?? 0;

  return (
    <section className="kpis" aria-label="KPIs">
      <article className="kpi hero">
        <h3>{t('kpiSaved')}</h3>
        <p className="kpi-value">
          {saved === null ? dash : fmt(saved)}
          {saved !== null && <span className="kpi-unit">{t('kpiSavedUnit')}</span>}
        </p>
        <p className="kpi-sub">
          {stats ? t('kpiSavedSub', { plan: fmt(stats.saved_min_total - fromReroutes), re: fmt(fromReroutes) }) : ' '}
        </p>
      </article>

      <article className="kpi">
        <h3>{t('kpiActive')}</h3>
        <p className="kpi-value">{stats ? fmt(stats.visitors.active) : dash}</p>
        <p className="kpi-sub">
          {stats ? t('kpiActiveSub', { total: fmt(stats.visitors.total), live: fmt(stats.visitors.connected ?? 0) }) : ' '}
        </p>
      </article>

      <article className="kpi">
        <h3>{t('kpiBooked')}</h3>
        <p className="kpi-value">{stats ? fmt(booked) : dash}</p>
        <p className="kpi-sub">{stats ? t('kpiBookedSub', { n: spread, all: stats.pavilions.length }) : ' '}</p>
      </article>

      <article className="kpi">
        <h3>{t('kpiOffers')}</h3>
        <p className="kpi-value">{stats ? fmt(stats.offers.sent) : dash}</p>
        <p className="kpi-sub">
          {stats ? t('kpiOffersSub', { acc: fmt(stats.offers.accepted), open: fmt(stats.offers.open) }) : ' '}
        </p>
      </article>

      <article className="kpi">
        <h3>{t('kpiWait')}</h3>
        <p className="kpi-value">
          {avgWait === null ? dash : fmt(avgWait)}
          {avgWait !== null && <span className="kpi-unit">{t('kpiSavedUnit')}</span>}
        </p>
        <p className="kpi-sub">
          {longest ? t('kpiWaitSub', { name: longestName, w: fmt(longest.wait_min) }) : ' '}
        </p>
      </article>
    </section>
  );
}
