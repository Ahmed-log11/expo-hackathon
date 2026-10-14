import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ForecastPoint, type PavilionCrowd, type Site } from './api';
import { DemoDock } from './components/DemoDock';
import { Header } from './components/Header';
import { KpiRow } from './components/KpiRow';
import { PavilionDetail } from './components/PavilionDetail';
import { PavilionTable } from './components/PavilionTable';
import { SiteMap } from './components/SiteMap';
import { TipProvider } from './components/Tooltip';
import { pool, usePoll } from './hooks';
import { useI18n } from './i18n';
import { type SimState, simulateVisitors } from './simulate';

const CROWD_MS = 5_000;
const STATS_MS = 5_000;
const STATS_SIM_MS = 2_000;        // while simulating, so the ledger visibly fills up
const STATS_MISSING_MS = 30_000;   // server without /admin/stats yet: check now and then
const FORECAST_MS = 60_000;
const TOKEN_KEY = 'insyab-admin-token';

function savedToken(): string {
  const fallback = import.meta.env.VITE_DEMO_TOKEN ?? '';
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const { t } = useI18n();

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
  const [statsMissing, setStatsMissing] = useState(false);
  const [crowd, refreshCrowd] = usePoll(api.crowd, CROWD_MS);
  const [stats, refreshStats] = usePoll(
    api.stats, statsMissing ? STATS_MISSING_MS : sim?.running ? STATS_SIM_MS : STATS_MS);
  useEffect(() => setStatsMissing(stats.error?.status === 404), [stats]);
  const statsData = statsMissing ? undefined : stats.data;

  // The model's forecast per pavilion (one request each, a few at a time).
  const pids = useMemo(() => site?.pavilions.map((p) => p.id) ?? [], [site]);
  const [forecasts, setForecasts] = useState<Record<string, ForecastPoint[]>>({});
  const loadForecast = useCallback(async (pid: string) => {
    try {
      const f = await api.forecast(pid);
      setForecasts((m) => ({ ...m, [pid]: f }));
    } catch { /* keep the last forecast */ }
  }, []);
  const refreshForecasts = useCallback(() => pool(pids, 6, loadForecast), [pids, loadForecast]);
  useEffect(() => {
    if (!pids.length) return;
    void refreshForecasts();
    const id = window.setInterval(() => void refreshForecasts(), FORECAST_MS);
    return () => window.clearInterval(id);
  }, [pids, refreshForecasts]);

  // The server's clock (Riyadh time, maybe not the laptop's): simulated visits are timed by it.
  const clockOffset = useRef(0);
  useEffect(() => {
    if (crowd.data && crowd.at) clockOffset.current = Date.parse(crowd.data.updated_at) - crowd.at;
  }, [crowd.data, crowd.at]);
  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

  // Selection and demo controls
  const [selected, setSelected] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [spikePid, setSpikePid] = useState('');
  const [token, setTokenState] = useState(savedToken);
  const setToken = useCallback((value: string) => {
    setTokenState(value);
    try { window.localStorage.setItem(TOKEN_KEY, value); } catch { /* kept for this session only */ }
  }, []);
  useEffect(() => {
    if (!spikePid && site?.pavilions.length) setSpikePid(site.pavilions.some((p) => p.id === 'jp') ? 'jp' : site.pavilions[0].id);
  }, [site, spikePid]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDemoOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      refreshStats();
      void refreshForecasts();
    }
  }, [site, serverNow, refreshStats, refreshForecasts]);
  const stopSim = useCallback(() => simCtrl.current?.abort(), []);

  const spike = useCallback(async (pid: string, waitMin: number) => {
    const res = await api.observe(pid, waitMin, token);
    setSelected(pid);
    refreshCrowd();
    refreshStats();
    void loadForecast(pid);
    return res;
  }, [token, refreshCrowd, refreshStats, loadForecast]);

  const reset = useCallback(async () => {
    await api.reset(token);
    refreshCrowd();
    refreshStats();
    void refreshForecasts();
  }, [token, refreshCrowd, refreshStats, refreshForecasts]);

  const openSpike = useCallback((pid: string) => {
    setSpikePid(pid);
    setDemoOpen(true);
  }, []);

  const crowdById = useMemo(() => {
    const out: Record<string, PavilionCrowd> = {};
    for (const c of crowd.data?.pavilions ?? []) out[c.pavilion_id] = c;
    return out;
  }, [crowd.data]);
  const pavilions = site?.pavilions ?? [];
  const selectedPlace = pavilions.find((p) => p.id === selected);

  return (
    <TipProvider>
      <Header crowd={crowd} demoOpen={demoOpen} onToggleDemo={() => setDemoOpen((o) => !o)} />
      <main className={demoOpen ? 'page with-dock' : 'page'}>
        <KpiRow stats={statsData} crowd={crowd.data} pavilions={pavilions} />
        {statsMissing && <p className="notice">{t('statsMissing')}</p>}
        {site ? (
          <div className="layout">
            <PavilionTable
              pavilions={pavilions}
              crowd={crowdById}
              stats={statsData}
              forecasts={forecasts}
              selected={selected}
              onSelect={setSelected}
            />
            <div className="side">
              <SiteMap pavilions={pavilions} crowd={crowdById} selected={selected} onSelect={setSelected} />
              <PavilionDetail
                pavilion={selectedPlace}
                districts={site.districts}
                crowd={selected ? crowdById[selected] : undefined}
                forecast={selected ? forecasts[selected] : undefined}
                routed={statsData?.pavilions.find((p) => p.pavilion_id === selected)?.routed_next_2h}
                buckets={statsData?.buckets ?? []}
                onSpike={openSpike}
                onClose={() => setSelected(null)}
              />
            </div>
          </div>
        ) : (
          <p className="loading-page">{crowd.error ? t('waking') : t('connecting')}</p>
        )}
      </main>
      {demoOpen && site && (
        <DemoDock
          pavilions={pavilions}
          spikePid={spikePid}
          setSpikePid={setSpikePid}
          sim={sim}
          token={token}
          setToken={setToken}
          onSimulate={(n) => void simulate(n)}
          onStopSim={stopSim}
          onSpike={spike}
          onReset={reset}
          onClose={() => setDemoOpen(false)}
        />
      )}
    </TipProvider>
  );
}
