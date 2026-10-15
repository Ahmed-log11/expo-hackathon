import type { Status } from '../api';
import { fmt } from '../format';
import { t } from '../strings';

/** Crowd status as the app shows it: dot + word + minutes, never colour alone. */
export function StatusPill({ status, wait }: { status: Status; wait: number }) {
  return (
    <span className={`pill pill-${status}`}>
      <i className="pill-dot" aria-hidden="true" />
      {t(status)} · {t('min', { n: fmt(wait) })}
    </span>
  );
}
