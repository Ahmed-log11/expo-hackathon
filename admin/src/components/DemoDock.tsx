import { useEffect, useState } from 'react';
import { type ApiError, type Place, toApiError } from '../api';
import { useI18n } from '../i18n';
import type { SimState } from '../simulate';

/** Kept as data and worded at render time, so it follows the language toggle. */
type Result =
  | { ok: true; key: 'spikeDone' | 'resetDone'; vars?: Record<string, number> }
  | { ok: false; error: ApiError }
  | null;

/** The presenter's controls, docked at the bottom so the dashboard stays visible while they act. */
export function DemoDock({ pavilions, spikePid, setSpikePid, sim, token, setToken, onSimulate, onStopSim, onSpike, onReset, onClose }: {
  pavilions: Place[];
  spikePid: string;
  setSpikePid: (pid: string) => void;
  sim: SimState | null;
  token: string;
  setToken: (token: string) => void;
  onSimulate: (count: number) => void;
  onStopSim: () => void;
  onSpike: (pid: string, waitMin: number) => Promise<{ alerts: number; offers: number }>;
  onReset: () => Promise<void>;
  onClose: () => void;
}) {
  const { t, name, errorText } = useI18n();
  const [wait, setWait] = useState(90);
  const [busy, setBusy] = useState(false);
  const [spikeResult, setSpikeResult] = useState<Result>(null);
  const [resetResult, setResetResult] = useState<Result>(null);
  const [confirming, setConfirming] = useState(false);
  const [showToken, setShowToken] = useState(Boolean(token));

  useEffect(() => {          // "click again to confirm" expires
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  const fail = (e: unknown): Result => {
    const error = toApiError(e);
    if (error.status === 403) setShowToken(true);
    return { ok: false, error };
  };
  const show = (r: Result) => r && (
    <p className={r.ok ? 'dock-ok' : 'dock-err'}>{r.ok ? t(r.key, r.vars) : errorText(r.error)}</p>
  );

  const spike = async () => {
    if (!spikePid) return;
    setBusy(true);
    try {
      const res = await onSpike(spikePid, wait);
      setSpikeResult({ ok: true, key: 'spikeDone', vars: { alerts: res.alerts, offers: res.offers } });
    } catch (e) {
      setSpikeResult(fail(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    try {
      await onReset();
      setResetResult({ ok: true, key: 'resetDone' });
    } catch (e) {
      setResetResult(fail(e));
    } finally {
      setBusy(false);
    }
  };

  const running = Boolean(sim?.running);
  const pct = sim ? Math.round(((sim.done + sim.failed) / Math.max(1, sim.total)) * 100) : 0;
  const sorted = [...pavilions].sort((a, b) => name(a).localeCompare(name(b)));

  return (
    <aside className="dock" aria-label={t('demo')}>
      <div className="dock-inner">
        <section className="dock-sec">
          <h3>{t('simTitle')}</h3>
          <p className="dock-hint">{t('simHint')}</p>
          <div className="dock-row">
            {[50, 200].map((n) => (
              <button key={n} type="button" className="btn accent" disabled={running || !pavilions.length}
                onClick={() => onSimulate(n)}><span dir="ltr">+{n}</span></button>
            ))}
            {running && <button type="button" className="btn ghost-light" onClick={onStopSim}>{t('stop')}</button>}
          </div>
          {sim && (
            <div className="sim-progress">
              <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${pct}%` }} />
              </div>
              <span className="num">
                {running ? t('simProgress', { done: sim.done, total: sim.total }) : t('simDone', { n: sim.done })}
                {sim.failed > 0 && ` · ${t('simFailed', { n: sim.failed })}`}
              </span>
              {sim.error && sim.failed > 0 && <span className="dock-err">{errorText(sim.error)}</span>}
            </div>
          )}
        </section>

        <section className="dock-sec">
          <h3>{t('spikeTitle')}</h3>
          <div className="dock-row">
            <select value={spikePid} onChange={(e) => setSpikePid(e.target.value)} aria-label={t('colPavilion')}>
              {sorted.map((p) => <option key={p.id} value={p.id}>{name(p, p.id)}</option>)}
            </select>
            <label className="wait-input">
              <span>{t('spikeWait')}</span>
              <input type="number" min={0} max={300} step={5} value={wait}
                onChange={(e) => setWait(Math.min(300, Math.max(0, Number(e.target.value) || 0)))} />
            </label>
            <button type="button" className="btn danger" disabled={busy || !spikePid} onClick={spike}>{t('spikeBtn')}</button>
          </div>
          {show(spikeResult)}
        </section>

        <section className="dock-sec">
          <h3>{t('resetTitle')}</h3>
          <p className="dock-hint">{t('resetHint')}</p>
          <div className="dock-row">
            <button type="button" className={`btn ${confirming ? 'danger' : 'ghost-light'}`} disabled={busy} onClick={reset}>
              {confirming ? t('resetConfirm') : t('resetBtn')}
            </button>
          </div>
          {show(resetResult)}
        </section>

        <section className="dock-sec dock-small">
          <button type="button" className="link" onClick={() => setShowToken((s) => !s)} aria-expanded={showToken}>
            {t('token')}
          </button>
          {showToken && (
            <input className="token" type="password" autoComplete="off" spellCheck={false} value={token}
              placeholder={t('tokenPlaceholder')} onChange={(e) => setToken(e.target.value.trim())} />
          )}
        </section>

        <button type="button" className="icon-btn dock-close" onClick={onClose} aria-label={t('close')}>×</button>
      </div>
    </aside>
  );
}
