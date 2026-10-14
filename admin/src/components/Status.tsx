import type { Status } from '../api';
import { fmt } from '../format';
import { useI18n } from '../i18n';

/** Crowd status as the app shows it: dot + word + minutes, never colour alone. */
export function StatusPill({ status, wait }: { status: Status; wait: number }) {
  const { t } = useI18n();
  return (
    <span className={`pill pill-${status}`}>
      <i className="pill-dot" aria-hidden="true" />
      {t(status)} · {t('min', { n: fmt(wait) })}
    </span>
  );
}

export function StatusLegend() {
  const { t } = useI18n();
  return (
    <ul className="legend">
      {(['low', 'medium', 'high'] as const).map((s) => (
        <li key={s}>
          <i className={`legend-dot pill-${s}`} aria-hidden="true" />
          {t(s === 'low' ? 'legendLow' : s === 'medium' ? 'legendMedium' : 'legendHigh')}
        </li>
      ))}
    </ul>
  );
}
