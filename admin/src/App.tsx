import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ForecastPoint, type PavilionCrowd, type Site } from './api';
import { Briefing } from './components/Briefing';
import { DemoDock } from './components/DemoDock';
import { Header } from './components/Header';
import { KpiRow } from './components/KpiRow';
import { PavilionTable } from './components/PavilionTable';
import { SiteOverview } from './components/SiteOverview';
import { SiteWaitChart } from './components/SiteWaitChart';
import { pool, usePoll } from './hooks';
import { type SimState, simulateVisitors } from './simulate';
import { t } from './strings';

const CROWD_MS = 5_000;
const STATS_MS = 5_000;
const STATS_SIM_MS = 2_000;   // while simulating, so the ledger visibly fills up
const FORECAST_MS = 60_000;
const HISTORY_MS = 60_000;   // the server samples the waits once a minute
const TOKEN_KEY = 'insyab-admin-token';

/** The simulation tools are for rehearsals and the live demo, so they only show when the URL has ?demo. */
const DEMO_MODE = new URLSearchParams(window.location.search).has('demo');

function savedToken(): string {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function App() {
  // Static site data, retried until the server answers (Render's free plan may be waking up).
  const [site, setSite] = useState<Site>();
  useEffect(() => {
    let stop = false;
    let timer = 0;
    const load = async () => {
      try {
        const s = await api.site();
        if (!stop) setSite(s);
      } catch {
        if (!stop) timer = window.setTimeout(load, 4000);
      }
    };
    void load();
    return () => { stop = true; window.clearTimeout(timer); };
  }, []);

  // Live data
  const [sim, setSim] = useState<SimState | null>(null);
  const [crowd, refreshCrowd] = usePoll(api.crowd, CROWD_MS);
  const [stats, refreshStats] = usePoll(api.stats, sim?.running ? STATS_SIM_MS : STATS_MS);
  const [history, refreshHistory] = usePoll(api.history, HISTORY_MS);

  // The model's forecast per pavilion (one request each, a few at a time).
  const pids = useMemo(() => site?.pavilions.map((p) => p.id) ?? [], [site]);
  const [forecasts, setForecasts] = useState<Record<string, ForecastPoint[]>>({});
  const refreshForecasts = useCallback(() => pool(pids, 6, async (pid) => {
    try {
      const f = await api.forecast(pid);
      setForecasts((m) => ({ ...m, [pid]: f }));
    } catch { /* keep the last forecast */ }
  }), [pids]);
  useEffect(() => {
    if (!pids.length) return;
    void refreshForecasts();
    const id = window.setInterval(() => void refreshForecasts(), FORECAST_MS);
    return () => window.clearInterval(id);
  }, [pids, refreshForecasts]);

  // Bumped after a demo action (spike, reset, simulate) so the AI briefing rewrites at once.
  const [briefBump, setBriefBump] = useState(0);
  const refreshAll = useCallback(() => {
    setBriefBump((n) => n + 1);
    refreshCrowd();
    refreshStats();
    refreshHistory();
    void refreshForecasts();
  }, [refreshCrowd, refreshStats, refreshHistory, refreshForecasts]);

  // The server's clock (Riyadh time, maybe not the laptop's): simulated visits are timed by it.
  const clockOffset = useRef(0);
  useEffect(() => {
    if (crowd.data && crowd.at) clockOffset.current = Date.parse(crowd.data.updated_at) - crowd.at;
  }, [crowd.data, crowd.at]);
  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

  // Demo controls
  const [demoOpen, setDemoOpen] = useState(false);
  const [token, setTokenState] = useState(savedToken);
  const setToken = useCallback((value: string) => {
    setTokenState(value);
    try { window.localStorage.setItem(TOKEN_KEY, value); } catch { /* kept for this session only */ }
  }, []);

  const simCtrl = useRef<AbortController | null>(null);
  useEffect(() => () => simCtrl.current?.abort(), []);
  const simulate = useCallback(async (count: number) => {
    if (!site || simCtrl.current) return;
    const ctrl = new AbortController();
    simCtrl.current = ctrl;
    setSim({ total: count, done: 0, failed: 0, running: true });
    try {
      await simulateVisitors({ count, pavilions: site.pavilions, serverNow, signal: ctrl.signal, onProgress: setSim });
    } finally {
      simCtrl.current = null;
      refreshAll();
    }
  }, [site, serverNow, refreshAll]);
  const stopSim = useCallback(() => simCtrl.current?.abort(), []);

  const crowdById = useMemo(() => {
    const out: Record<string, PavilionCrowd> = {};
    for (const c of crowd.data?.pavilions ?? []) out[c.pavilion_id] = c;
    return out;
  }, [crowd.data]);

  return (
    <>
      <Header crowd={crowd} demoOpen={demoOpen} onToggleDemo={DEMO_MODE ? () => setDemoOpen((o) => !o) : undefined} />
      <main className={demoOpen ? 'page with-dock' : 'page'}>
        <Briefing bump={briefBump} />
        <KpiRow stats={stats.data} crowd={crowd.data} />
        <SiteWaitChart history={history.data} />
        {site && <SiteOverview site={site} crowd={crowdById} stats={stats.data} history={history.data} />}
        {site ? (
          <PavilionTable pavilions={site.pavilions} crowd={crowdById} stats={stats.data} forecasts={forecasts} history={history.data} />
        ) : (
          <p className="loading-page">{t(crowd.error ? 'waking' : 'connecting')}</p>
        )}
      </main>
      {DEMO_MODE && demoOpen && site && (
        <DemoDock
          pavilions={site.pavilions}
          sim={sim}
          token={token}
          setToken={setToken}
          onSimulate={(n) => void simulate(n)}
          onStopSim={stopSim}
          onChanged={refreshAll}
          onClose={() => setDemoOpen(false)}
        />
      )}
    </>
  );
}
