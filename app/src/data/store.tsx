/**
 * App state: the visitor's plan inputs, their route from the API, live crowd levels and reroute offers.
 * Screens read from here and call these actions; all decisions come from the backend.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { backend, CrowdItem, LiveMessage, Offer, Route, Summary, WishItem } from './api';

export type PlanInput = { start: Date; end: Date; tags: string[]; mustVisit: string[]; comfort: string[] };
export type Done = { id: string; wait: number; visit: number; at: Date };
export type Alert = { pavilion_id: string; wait_min: number; planned_wait_min: number };

type Store = {
  mode: 'live' | 'demo';
  plan: PlanInput;
  setPlan: (p: Partial<PlanInput>) => void;
  visitorId?: string;
  route?: Route;
  wishlist?: WishItem[];
  done: Done[];
  crowd: Record<string, number>;
  alert?: Alert;
  offer?: Offer;
  savedByReroutes: number;
  summary?: Summary;
  error?: string;
  createPlan: () => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  event: (type: 'arrived' | 'entered' | 'left', pid: string) => Promise<void>;
  triggerCrowd: () => Promise<void>;
  refreshCrowd: () => void;
  loadSummary: () => Promise<void>;
  clearAlert: () => void;
  resetDay: () => void;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

/** Default plan: during opening hours (10:00–23:00) it starts now, so live reroutes work right away;
 * otherwise tomorrow at 4:00 PM. It runs up to 6 hours and never past midnight (the Expo closes then). */
function defaultPlan(): PlanInput {
  const now = new Date();
  const h = now.getHours();
  const start = new Date(now);
  if (h < 10 || h >= 23) {
    if (h >= 23) start.setDate(start.getDate() + 1);
    start.setHours(16, 0, 0, 0);
  }
  const end = new Date(Math.min(start.getTime() + 6 * 3600_000, new Date(start).setHours(24, 0, 0, 0)));
  return { start, end, tags: ['culture', 'technology'], mustVisit: [], comfort: ['shade', 'less_wait', 'family'] };
}
export function dayLabel(d: Date) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((x.getTime() - t.getTime()) / 86_400_000);
  return diff === 0 ? 'اليوم' : diff === 1 ? 'غدًا' : AR_DAYS[d.getDay()];
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlanState] = useState<PlanInput>(defaultPlan);
  const [visitorId, setVisitorId] = useState<string>();
  const [route, setRoute] = useState<Route>();
  const [wishlist, setWishlist] = useState<WishItem[]>();
  const [done, setDone] = useState<Done[]>([]);
  const [crowd, setCrowd] = useState<Record<string, number>>({});
  const [alert, setAlert] = useState<Alert>();
  const [offer, setOffer] = useState<Offer>();
  const [savedByReroutes, setSaved] = useState(0);
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState<string>();
  const unsub = useRef<(() => void) | undefined>(undefined);
  const vidRef = useRef<string | undefined>(undefined);

  const onLive = useCallback((m: LiveMessage) => {
    if (m.type === 'crowd_update') setCrowd(Object.fromEntries(m.pavilions.map((p: CrowdItem) => [p.pavilion_id, p.wait_min])));
    else if (m.type === 'crowd_alert') setAlert({ pavilion_id: m.pavilion_id, wait_min: m.wait_min, planned_wait_min: m.planned_wait_min });
    else if (m.type === 'reroute_offer') setOffer(m);
    else if (m.type === 'reroute') setRoute(m.route);
  }, []);

  const refreshCrowd = useCallback(() => {
    backend.crowd().then((c) => setCrowd(Object.fromEntries(c.map((p) => [p.pavilion_id, p.wait_min])))).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCrowd();
    return () => unsub.current?.();
  }, [refreshCrowd]);

  // Before a plan exists there is no live socket, so poll the crowd every 30 s.
  useEffect(() => {
    if (visitorId) return;
    const t = setInterval(refreshCrowd, 30_000);
    return () => clearInterval(t);
  }, [visitorId, refreshCrowd]);

  const createPlan = useCallback(async () => {
    setError(undefined);
    try {
      // The wizard may sit open for a while: a start that slipped into the past becomes "now" (the API rejects it otherwise).
      const start = new Date(Math.max(plan.start.getTime(), Date.now()));
      const end = new Date(Math.max(plan.end.getTime(), start.getTime() + 3600_000));
      const res = await backend.createVisitor({
        // Picked pavilions only: interest tags would make the server add pavilions the visitor never chose.
        interest_tags: plan.mustVisit.length ? [] : plan.tags, must_visit: plan.mustVisit, language: 'ar',
        start_time: start.toISOString(), end_time: end.toISOString(),
      });
      unsub.current?.();
      vidRef.current = res.visitor_id;
      setVisitorId(res.visitor_id);
      setRoute(res.route);
      setWishlist(res.wishlist);
      setDone([]); setOffer(undefined); setAlert(undefined); setSaved(0); setSummary(undefined);
      unsub.current = backend.live(res.visitor_id, onLive);
    } catch (e: any) {
      setError(e?.message ?? 'تعذّر إنشاء الخطة');
      throw e;
    }
  }, [plan, onLive]);

  const accept = useCallback(async () => {
    if (!vidRef.current || !offer) return;
    try {
      const r = await backend.accept(vidRef.current, offer.offer_id);
      setRoute(r);
      setSaved((v) => v + offer.saves_min);
    } finally {
      setOffer(undefined);
      setAlert(undefined);
    }
  }, [offer]);

  const decline = useCallback(async () => {
    if (!vidRef.current || !offer) return;
    try { await backend.decline(vidRef.current, offer.offer_id); } catch {}
    setOffer(undefined);
  }, [offer]);

  const event = useCallback(async (type: 'arrived' | 'entered' | 'left', pid: string) => {
    const vid = vidRef.current;
    if (!vid) return;
    await backend.event(vid, type, pid).catch(() => {});
    if (type === 'left') {
      const st = route?.stops.find((s) => s.pavilion_id === pid);
      // A double tap can send "left" twice; record each pavilion once.
      setDone((d) => (d.some((x) => x.id === pid) ? d : [...d, { id: pid, wait: st?.wait_min ?? 0, visit: st?.visit_min ?? 0, at: new Date() }]));
      setRoute(await backend.route(vid));
    }
    // fresh crowd levels for the next stop rather than waiting for the next live tick
    if (type === 'entered' || type === 'left') refreshCrowd();
  }, [route, refreshCrowd]);

  /** Demo control: the next stop's queue jumps past the engine's 60-min limit, which makes it offer a better order. */
  const triggerCrowd = useCallback(async () => {
    const next = route?.stops[0];
    if (!next) return;
    await backend.spike(next.pavilion_id, Math.max(90, next.wait_min + 45)).catch((e) => setError(e?.message));
  }, [route]);

  const loadSummary = useCallback(async () => {
    if (!vidRef.current) return;
    setSummary(await backend.summary(vidRef.current));
  }, []);

  const resetDay = useCallback(() => {
    unsub.current?.();
    vidRef.current = undefined;
    setVisitorId(undefined); setRoute(undefined); setDone([]); setOffer(undefined); setAlert(undefined); setSummary(undefined); setSaved(0);
  }, []);

  const value = useMemo<Store>(() => ({
    mode: backend.mode, plan, setPlan: (p) => setPlanState((o) => ({ ...o, ...p })),
    visitorId, route, wishlist, done, crowd, alert, offer, savedByReroutes, summary, error,
    createPlan, accept, decline, event, triggerCrowd, refreshCrowd, loadSummary, clearAlert: () => setAlert(undefined), resetDay,
  }), [plan, visitorId, route, wishlist, done, crowd, alert, offer, savedByReroutes, summary, error, createPlan, accept, decline, event, triggerCrowd, refreshCrowd, loadSummary, resetDay]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---------- formatting (Riyadh time, Arabic UI) ----------
/** "4:10 م" from an ISO time (shown in Riyadh time, UTC+3). */
export function fmtTime(t: string | Date, withSuffix = true) {
  const d = typeof t === 'string' ? new Date(t) : t;
  const r = new Date(d.getTime() + 3 * 3600_000);
  let h = r.getUTCHours();
  const m = r.getUTCMinutes();
  const pm = h >= 12;
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')}${withSuffix ? (pm ? ' م' : ' ص') : ''}`;
}
/** "1 س و20 د" / "57 د" */
export function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m} د`;
  if (!m) return `${h} س`;
  return `${h} س و${m} د`;
}
export const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
