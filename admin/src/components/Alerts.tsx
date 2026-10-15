import type { SiteEvent } from '../api';
import { fmt, hhmm } from '../format';
import { type Key, t } from '../strings';

const LEVEL_LABEL: Record<SiteEvent['level'], Key> = {
  critical: 'aiCritical', warning: 'aiWarning', good: 'aiGood', info: 'aiInfo',
};

/** One alert as a sentence, e.g. "جناح ألمانيا أصبح مزدحمًا (66 د)". */
export function eventText(e: SiteEvent, names: Record<string, string>): string {
  const name = names[e.pavilion_id] ?? e.pavilion_id;
  switch (e.kind) {
    case 'high': return t('evHigh', { name, n: fmt(e.wait_min ?? 0) });
    case 'calm': return t('evCalm', { name, n: fmt(e.wait_min ?? 0) });
    case 'rising': return t('evRising', { name, a: fmt(e.before_min ?? 0), b: fmt(e.wait_min ?? 0) });
    case 'report': return t('evReport', { name, n: fmt(e.wait_min ?? 0) });
    case 'offers': return t(e.pavilion_id ? 'evOffersFor' : 'evOffers', { name, n: e.count ?? 1 });
    case 'accepted': return t(e.pavilion_id ? 'evAcceptedFor' : 'evAccepted', { name, n: fmt(e.saves_min ?? 0) });
  }
}

/** A list of alerts: time, level tag (word + colour), sentence. Clicking one opens its pavilion. */
export function EventList({ events, names, onSelect }: {
  events: SiteEvent[];
  names: Record<string, string>;
  onSelect?: (pid: string) => void;
}) {
  return (
    <ul className="events">
      {events.map((e, i) => {
        const clickable = !!onSelect && !!e.pavilion_id;
        const body = (
          <>
            <time className="ev-time num">{hhmm(e.at)}</time>
            <span className={`lv-tag ev-${e.level}`}>{t(LEVEL_LABEL[e.level])}</span>
            <span className="ev-text">
              {eventText(e, names)}
              {e.estimated && <span className="muted"> · {t('evEstimated')}</span>}
            </span>
          </>
        );
        return (
          <li key={`${e.at}-${e.kind}-${e.pavilion_id}-${i}`} className={`ev lv-${e.level}`}>
            {clickable
              ? <button type="button" className="ev-row" onClick={() => onSelect(e.pavilion_id)} title={t('openDetail')}>{body}</button>
              : <div className="ev-row">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** The alerts feed card: what changed on the site in the last 2 hours (GET /admin/events). */
export function AlertsFeed({ events, names, onSelect }: {
  events?: SiteEvent[];
  names: Record<string, string>;
  onSelect: (pid: string) => void;
}) {
  return (
    <section className="card alerts-card" aria-labelledby="alerts-title">
      <div className="chart-head">
        <h2 id="alerts-title">{t('alertsTitle')}</h2>
        <span className="muted alerts-sub">{t('alertsSub')}</span>
      </div>
      <div className="alerts-scroll">
        {!events && <p className="muted">{t('connecting')}</p>}
        {events && !events.length && <p className="muted">{t('alertsEmpty')}</p>}
        {events && events.length > 0 && <EventList events={events} names={names} onSelect={onSelect} />}
      </div>
    </section>
  );
}
