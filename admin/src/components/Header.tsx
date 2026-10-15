import type { Crowd } from '../api';
import { type Poll, useNow } from '../hooks';
import { t } from '../strings';

const PAGE_OPENED = Date.now();
const STALE_MS = 20_000;
const WAKE_GRACE_MS = 90_000;   // Render's free plan sleeps; the first request can take ~1 min

/** Brand, connection state (so the presenter knows the data is live) and, in ?demo mode, the simulation button. */
export function Header({ crowd, demoOpen, onToggleDemo }: {
  crowd: Poll<Crowd>;
  demoOpen: boolean;
  onToggleDemo?: () => void;
}) {
  const now = useNow(2000);

  let state: 'live' | 'connecting' | 'waking' | 'offline';
  if (crowd.data && crowd.at && now - crowd.at < STALE_MS) state = 'live';
  else if (!crowd.data && now - PAGE_OPENED < WAKE_GRACE_MS) state = crowd.error ? 'waking' : 'connecting';
  else state = 'offline';

  return (
    <header className="topbar">
      <div className="topbar-inner">
      <div className="brand">
        {/* Official INSYAB lockup (Figma export, app/src/assets/svg.ts LOGO_SVGS.lockupDark): white wordmark + aqua flow symbol */}
        <img className="brand-lockup" src={`${import.meta.env.BASE_URL}insyab-lockup.svg`} alt={`${t('brand')} INSYAB`} height={34} />
        <span className="brand-sep" aria-hidden="true" />
        <span className="brand-sub">{t('title')}</span>
      </div>
      <div className="topbar-end">
        <span className={`status-chip ${state}`} aria-live="polite">
          <i className="live-dot" aria-hidden="true" />
          {t(state)}
        </span>
        {onToggleDemo && (
          <button type="button" className={`btn accent ${demoOpen ? 'on' : ''}`} onClick={onToggleDemo} aria-expanded={demoOpen}>
            {t('demo')}
          </button>
        )}
      </div>
      </div>
    </header>
  );
}
