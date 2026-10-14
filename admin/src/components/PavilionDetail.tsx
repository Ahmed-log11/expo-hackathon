import type { District, ForecastPoint, PavilionCrowd, Place } from '../api';
import { fmt, hhmm } from '../format';
import { useI18n } from '../i18n';
import { StatusPill } from './Status';

/** Everything about one pavilion: facts, the model's forecast with its numbers, and its ledger bookings. */
export function PavilionDetail({ pavilion, districts, crowd, forecast, routed, buckets, onSpike, onClose }: {
  pavilion?: Place;
  districts: District[];
  crowd?: PavilionCrowd;
  forecast?: ForecastPoint[];
  routed?: number[];
  buckets: string[];
  onSpike: (pid: string) => void;
  onClose: () => void;
}) {
  const { t, name, rtl, lang } = useI18n();
  if (!pavilion) {
    return (
      <section className="card detail-card empty">
        <p className="hint">{t('detailHint')}</p>
      </section>
    );
  }
  const district = districts.find((d) => d.id === pavilion.district);
  return (
    <section className="card detail-card" aria-live="polite">
      <header className="detail-head">
        <div>
          <h2>{name(pavilion, pavilion.id)}</h2>
          <p className="muted">
            {lang === 'ar' ? pavilion.name_en : pavilion.name_ar}
            {district && ` · ${name(district)}`}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')}>×</button>
      </header>

      <div className="facts">
        <div>
          <span>{t('detailWait')}</span>
          {crowd ? <StatusPill status={crowd.status} wait={crowd.wait_min} /> : <b>…</b>}
        </div>
        <div><span>{t('detailQueue')}</span><b className="num">{crowd ? fmt(crowd.queue_length) : '…'}</b></div>
        <div><span>{t('detailCapacity')}</span><b className="num">{fmt(pavilion.capacity_per_hour ?? 0)}</b></div>
        <div><span>{t('detailVisit')}</span><b className="num">{t('min', { n: pavilion.avg_visit_min ?? 0 })}</b></div>
      </div>

      <h3>{t('detailForecast')} <span className="badge">ML</span></h3>
      <p className="note">{t('detailForecastNote')}</p>
      {forecast ? <ForecastChart points={forecast} rtl={rtl} /> : <p className="muted">{t('loading')}</p>}

      <h3>{t('detailLedger')}</h3>
      {routed ? <LedgerColumns values={routed} buckets={buckets} rtl={rtl} /> : <p className="muted">—</p>}

      <button type="button" className="btn outline" onClick={() => onSpike(pavilion.id)}>{t('spikeHere')}</button>
    </section>
  );
}

const CW = 320;
const CH = 118;

/** Four points, each labelled: it's only four numbers, and this panel is their table view. */
function ForecastChart({ points, rtl }: { points: ForecastPoint[]; rtl: boolean }) {
  const { t } = useI18n();
  const top = 22, bottom = CH - 24, padX = 26;
  const max = Math.max(30, ...points.map((p) => p.wait_min)) * 1.15;
  const x = (i: number) => {
    const v = padX + (i * (CW - 2 * padX)) / Math.max(1, points.length - 1);
    return rtl ? CW - v : v;
  };
  const y = (w: number) => bottom - (w / max) * (bottom - top);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.wait_min).toFixed(1)}`);
  const area = `M${x(0)},${bottom} L${line.join(' L')} L${x(points.length - 1)},${bottom} Z`;
  return (
    <svg className="fchart" viewBox={`0 0 ${CW} ${CH}`} role="img"
      aria-label={points.map((p) => `${p.minutes}: ${p.wait_min}`).join(', ')}>
      <line x1={0} x2={CW} y1={bottom} y2={bottom} className="axis" />
      <path d={area} className="spark-area" />
      <polyline points={line.join(' ')} className="spark-line" />
      {points.map((p, i) => (
        <g key={p.minutes}>
          <circle cx={x(i)} cy={y(p.wait_min)} r={4.5} className="spark-dot" />
          <text x={x(i)} y={y(p.wait_min) - 10} className="pt-label">{t('min', { n: p.wait_min })}</text>
          <text x={x(i)} y={CH - 6} className="axis-label">{p.minutes === 0 ? t('now') : t('after', { n: p.minutes })}</text>
        </g>
      ))}
    </svg>
  );
}

/** The ledger row for this pavilion as columns: routed arrivals per 15 minutes. */
function LedgerColumns({ values, buckets, rtl }: { values: number[]; buckets: string[]; rtl: boolean }) {
  const top = 18, bottom = 76, H = 96, band = CW / values.length, bar = Math.min(22, band - 8);
  const max = Math.max(4, ...values);
  const cx = (i: number) => {
    const v = band * i + band / 2;
    return rtl ? CW - v : v;
  };
  return (
    <svg className="lchart" viewBox={`0 0 ${CW} ${H}`} role="img" aria-label={values.join(', ')}>
      <line x1={0} x2={CW} y1={bottom} y2={bottom} className="axis" />
      {values.map((v, i) => {
        const h = (v / max) * (bottom - top);
        const x0 = cx(i) - bar / 2;
        const r = Math.min(4, h);
        return (
          <g key={i}>
            {v > 0 && (
              <path className="lbar" d={`M${x0},${bottom} V${bottom - h + r} Q${x0},${bottom - h} ${x0 + r},${bottom - h}
                H${x0 + bar - r} Q${x0 + bar},${bottom - h} ${x0 + bar},${bottom - h + r} V${bottom} Z`} />
            )}
            {v > 0 && <text x={cx(i)} y={bottom - h - 5} className="pt-label">{v}</text>}
            <text x={cx(i)} y={H - 6} className="axis-label">{buckets[i] ? hhmm(buckets[i]) : ''}</text>
          </g>
        );
      })}
    </svg>
  );
}
