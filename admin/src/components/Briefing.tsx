import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type InsightFocus, type InsightLevel, type Insights, toApiError } from '../api';
import { type Key, errorText, t } from '../strings';

const REFRESH_MS = 60_000;   // the server caches each briefing for 60 s

const FOCUSES: { id: InsightFocus; label: Key }[] = [
  { id: 'overview', label: 'aiFocusOverview' },
  { id: 'hotspots', label: 'aiFocusHotspots' },
  { id: 'next_hour', label: 'aiFocusNextHour' },
  { id: 'actions', label: 'aiFocusActions' },
  { id: 'balancing', label: 'aiFocusBalancing' },
];

const LEVEL_LABEL: Record<InsightLevel, Key> = {
  critical: 'aiCritical', warning: 'aiWarning', good: 'aiGood', info: 'aiInfo',
};

const clock = (iso: string) => iso.slice(11, 16);

/**
 * The AI briefing at the top of the page: pick a question (quick chips), read a headline and
 * up to five ranked points, each with the action to take. Written by the server from live
 * numbers (GET /admin/insights); `bump` changes after a demo action so it refreshes at once.
 */
export function Briefing({ bump }: { bump: number }) {
  const [focus, setFocus] = useState<InsightFocus>('overview');
  const [byFocus, setByFocus] = useState<Partial<Record<InsightFocus, Insights>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(focus);
  latest.current = focus;

  const load = useCallback(async (f: InsightFocus, refresh: boolean) => {
    setLoading(true);
    try {
      const res = await api.insights(f, refresh);
      setByFocus((m) => ({ ...m, [f]: res }));
      if (latest.current === f) setError('');
    } catch (e) {
      if (latest.current === f) setError(errorText(toApiError(e)));
    } finally {
      if (latest.current === f) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(focus, false);
    const id = window.setInterval(() => void load(focus, false), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [focus, load]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    void load(latest.current, true);
  }, [bump, load]);

  const data = byFocus[focus];

  return (
    <section className="card brief" aria-labelledby="brief-title" aria-busy={loading}>
      <div className="brief-head">
        <h2 id="brief-title">
          <img className="brief-avatar" src={`${import.meta.env.BASE_URL}insyab-icon.svg`} alt="" width={40} height={40} />
          <span className="ai-mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" fill="currentColor" /></svg>
          </span>
          {t('aiTitle')}
        </h2>
        <div className="brief-meta">
          {data && (
            <span className="muted">
              {t(data.source === 'llm' ? 'aiSourceLlm' : 'aiSourceRules')} · {t('aiUpdated', { time: clock(data.generated_at) })}
            </span>
          )}
          <button type="button" className="btn soft" onClick={() => void load(focus, true)} disabled={loading}>
            {loading ? t('aiWriting') : t('aiRefresh')}
          </button>
        </div>
      </div>

      <div className="chips" role="tablist" aria-label={t('aiTitle')}>
        {FOCUSES.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={focus === f.id}
            className={`chip ${focus === f.id ? 'on' : ''}`}
            onClick={() => setFocus(f.id)}
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      {error && !data && <p className="brief-state brief-error" role="status"><i aria-hidden="true" />{t('aiError')}: {error}</p>}
      {!data && !error && <p className="brief-state brief-loading" role="status"><i aria-hidden="true" />{t('aiWriting')}</p>}

      {data && (
        <div className={loading ? 'brief-body stale' : 'brief-body'}>
          <p className="brief-headline">{data.headline}</p>
          <ul className="brief-items" data-count={data.items.length}>
            {data.items.map((it, i) => (
              <li key={i} className={`brief-item lv-${it.level}`}>
                <span className="lv-tag">{t(LEVEL_LABEL[it.level])}</span>
                <div className="brief-text">
                  <strong>{it.title}</strong>
                  <p>{it.detail}</p>
                  {it.action && <p className="brief-action"><b>{t('aiAction')}:</b> {it.action}</p>}
                </div>
              </li>
            ))}
          </ul>
          {data.compare_minutes_ago === null && (focus === 'overview' || focus === 'hotspots') && (
            <p className="brief-note muted">{t('aiNoHistory')}</p>
          )}
        </div>
      )}
    </section>
  );
}
