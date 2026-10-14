import { API_URL, type Crowd } from '../api';
import { hhmm } from '../format';
import { type Poll, useNow } from '../hooks';
import { useI18n } from '../i18n';

const PAGE_OPENED = Date.now();
const STALE_MS = 20_000;
const WAKE_GRACE_MS = 90_000;   // Render's free plan sleeps; the first request can take ~1 min

export function Header({ crowd, demoOpen, onToggleDemo }: {
  crowd: Poll<Crowd>;
  demoOpen: boolean;
  onToggleDemo: () => void;
}) {
  const { t, lang, setLang } = useI18n();
  const now = useNow(1000);

  let state: 'live' | 'connecting' | 'waking' | 'offline';
  if (crowd.data && crowd.at && now - crowd.at < STALE_MS) state = 'live';
  else if (!crowd.data && now - PAGE_OPENED < WAKE_GRACE_MS) state = crowd.error ? 'waking' : 'connecting';
  else state = 'offline';

  return (
    <header className="topbar">
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" width={30} height={30} />
        <strong>{t('brand')}</strong>
        <span className="brand-sep" aria-hidden="true" />
        <span className="brand-sub">{t('title')}</span>
      </div>
      <div className="topbar-end">
        <span className={`status-chip ${state}`} aria-live="polite">
          <i className="live-dot" aria-hidden="true" />
          {state === 'live' && crowd.data && crowd.at ? (
            <>
              {t('live')}
              <span className="chip-sep" aria-hidden="true">·</span>
              <span className="num">{t('serverClock', { t: hhmm(crowd.data.updated_at) })}</span>
              <span className="chip-sep" aria-hidden="true">·</span>
              <span className="num">{t('updatedAgo', { s: Math.max(0, Math.round((now - crowd.at) / 1000)) })}</span>
            </>
          ) : t(state === 'live' ? 'live' : state)}
        </span>
        <span className="host-chip" title={API_URL}>{new URL(API_URL).host}</span>
        <button type="button" className="btn ghost-light" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>
          {t('switchLang')}
        </button>
        <button type="button" className={`btn accent ${demoOpen ? 'on' : ''}`} onClick={onToggleDemo} aria-expanded={demoOpen}>
          {t('demo')}
        </button>
      </div>
    </header>
  );
}
