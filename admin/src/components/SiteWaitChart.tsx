import { useMemo } from 'react';
import type { History } from '../api';
import { t } from '../strings';
import { WaitChart, WaitChartKey, type WaitSeries, hasEstimated } from './WaitChart';

/** The site's average wait: the last 2 hours and the model's forecast for the next 90 minutes. */
export function SiteWaitChart({ history }: { history?: History }) {
  const series = useMemo<WaitSeries | undefined>(() => history && {
    as_of: history.as_of,
    points: history.points.map((p) => ({ at: p.at, value: p.avg_wait_min, estimated: p.estimated })),
    forecast: history.forecast.map((f) => ({ minutes: f.minutes, at: f.at, value: f.avg_wait_min })),
  }, [history]);

  return (
    <section className="card chart-card" aria-labelledby="chart-title">
      <div className="chart-head">
        <div>
          <h2 id="chart-title">{t('chartTitle')}</h2>
          <p className="muted">{t('chartSub')}</p>
        </div>
        <WaitChartKey estimated={hasEstimated(series)} />
      </div>
      <WaitChart series={series} label={t('chartTitle')} />
    </section>
  );
}
