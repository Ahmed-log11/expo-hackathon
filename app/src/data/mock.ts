/**
 * Demo mode: an offline stand-in for the API that replays the story drawn in the Figma prototype
 * (Saudi → Japan → Korea …, then Japan gets crowded and the visitor is offered Korea first, saving 26 min).
 * It answers with exactly the same shapes as the real API, so every screen works the same way in both modes.
 */
import type { Backend, CrowdItem, LiveMessage, NewVisitor, Offer, Route, Stop, Summary, VisitorCreated } from './api';
import { PAVILION_IDS, PLACES } from './places';

const STORY = ['ksa', 'jp', 'kr', 'th_planet', 'th_technology'];
// Timings from the design (Plan — Ready): minutes after the start, waits, walks, visits, shade.
const ARRIVE = [10, 65, 108, 190, 245];
const WAIT = [12, 12, 10, 15, 8];
const WALK = [9, 8, 6, 7, 9];
const VISIT = [30, 25, 30, 25, 30];
const SHADE = [60, 80, 70, 90, 50];

const BASE_WAIT: Record<string, number> = { ksa: 12, jp: 12, kr: 10, th_planet: 15, th_technology: 22 };

type V = { route: Route; done: { id: string; at: string; wait: number; visit: number }[]; listeners: Set<(m: LiveMessage) => void>; offered: boolean; accepted: number; eased: string[] };
const visitors: Record<string, V> = {};
const crowd: Record<string, number> = {};
for (const id of PAVILION_IDS) crowd[id] = BASE_WAIT[id] ?? Math.round(6 + ((PLACES[id].popularity ?? 3) - 1) * 5);

const iso = (d: Date) => {
  const z = new Date(d.getTime() + 3 * 3600_000);   // Riyadh time
  return z.toISOString().replace(/\.\d{3}Z$/, '+03:00');
};
const addMin = (t: string, m: number) => new Date(new Date(t).getTime() + m * 60_000);
const delay = <T,>(v: T, ms = 260) => new Promise<T>((r) => setTimeout(() => r(v), ms));

function stop(order: number, id: string, arrive: Date, walk: number, wait: number, visit: number, shade: number): Stop {
  return {
    order, pavilion_id: id, walk_from_prev_min: walk, walk_m: walk * 75, arrive_at: iso(arrive),
    wait_min: wait, visit_min: visit, leave_at: iso(new Date(arrive.getTime() + (wait + visit) * 60_000)),
    path: [], landmarks: [], shaded_pct: shade,
  };
}

function storyRoute(vid: string, ids: string[], start: Date, end: Date, version = 1): Route {
  const stops = ids.map((id, i) => stop(i + 1, id, new Date(start.getTime() + ARRIVE[i] * 60_000), WALK[i], WAIT[i], VISIT[i], SHADE[i]));
  return {
    visitor_id: vid, version, generated_at: iso(start), start_point: 'metro', end_time: iso(end), stops,
    totals: { walk_min: WALK.reduce((a, b) => a + b, 0), wait_min: 57, stops: stops.length, distance_km: 8.2, baseline_wait_min: 137, saved_wait_min: 80 },
    feasibility: { fits: stops.length, requested: stops.length, dropped: [], too_busy: [] },
    summary: null,
  };
}

function emit(v: V, m: LiveMessage) { v.listeners.forEach((f) => f(m)); }
function crowdItems(): CrowdItem[] {
  return PAVILION_IDS.map((id) => ({ pavilion_id: id, wait_min: crowd[id], queue_length: crowd[id] * 15, status: crowd[id] < 15 ? 'low' : crowd[id] < 40 ? 'medium' : 'high' }));
}

export function mockBackend(): Backend {
  return {
    mode: 'demo',
    async createVisitor(body: NewVisitor): Promise<VisitorCreated> {
      const vid = 'v_demo' + Math.random().toString(16).slice(2, 6);
      const picked = (body.must_visit ?? []).filter((id) => PLACES[id]);
      const ids = [...new Set([...picked, ...STORY])].slice(0, 5);
      const now = new Date();
      const start = body.start_time ? new Date(body.start_time) : now;
      const end = body.end_time ? new Date(body.end_time) : new Date(start.getTime() + 6 * 3600_000);
      const route = storyRoute(vid, ids, start, end);
      visitors[vid] = { route, done: [], listeners: new Set(), offered: false, accepted: 0, eased: [] };
      const wishlist = ids.map((id) => ({ pavilion_id: id, reason: picked.includes(id) ? 'اخترته بنفسك' : 'يناسب اهتماماتك', source: picked.includes(id) ? 'picked' : 'interests' }));
      return delay({ visitor_id: vid, language: 'ar', wishlist, wishlist_source: 'none', route }, 400);
    },
    async route(vid) { return delay(visitors[vid].route, 120); },
    async event(vid, type, pid) {
      const v = visitors[vid];
      if (type === 'left') {
        const st = v.route.stops.find((s) => s.pavilion_id === pid);
        v.done.push({ id: pid, at: iso(new Date()), wait: pid === 'kr' ? 9 : st?.wait_min ?? 10, visit: pid === 'kr' ? 31 : st?.visit_min ?? 25 });
        v.route = { ...v.route, version: v.route.version + 1, stops: v.route.stops.filter((s) => s.pavilion_id !== pid).map((s, i) => ({ ...s, order: i + 1 })) };
      }
      // While the visitor is inside the quieter pavilion, the crowd at the one they avoided eases (design: "عاد منخفضًا كما توقعنا").
      if (type === 'entered') for (const e of v.eased) crowd[e] = 12;
      await delay(null, 120);
    },
    async summary(vid): Promise<Summary> {
      const v = visitors[vid];
      // Demo: the day is fast-forwarded to its end, as in the prototype (Next Stop → Day Summary).
      const times = [10, 66, 113, 190, 248];
      const order = [...v.done.map((d) => d.id), ...v.route.stops.map((s) => s.pavilion_id)];
      const start = new Date(v.route.generated_at);
      return delay({
        visitor_id: vid, as_of: iso(new Date()),
        visited: order.map((id, i) => ({ pavilion_id: id, left_at: iso(addMin(iso(start), times[i] ?? 60 * i)), wait_min: 10, wait_source: 'estimated', visit_min: 25, walk_m: 600 })),
        remaining: [], not_visited: [],
        totals: { pavilions: order.length, wait_min: 50, visit_min: 140, distance_km: 8.4, saved_min: 76 },
        saved_breakdown: { plan_min: 50, reroutes_min: 26 }, reroutes_accepted: v.accepted, eased: v.eased.length ? v.eased : ['jp'],
      });
    },
    async accept(vid, oid) {
      const v = visitors[vid];
      v.accepted += 1;
      const o = pendingOffers[oid];
      if (o.trigger) v.eased.push(o.trigger.pavilion_id);
      crowd[o.new[0].pavilion_id] = 9;   // the quieter pavilion stays calm (design: 9 min on arrival, less than expected)
      return delay(v.route = o.route, 200);
    },
    async decline(vid) { await delay(null, 120); },
    async crowd() { return delay(crowdItems(), 100); },
    live(vid, onMessage) {
      const v = visitors[vid];
      v.listeners.add(onMessage);
      onMessage({ type: 'crowd_update', updated_at: iso(new Date()), pavilions: crowdItems() });
      const t = setInterval(() => onMessage({ type: 'crowd_update', updated_at: iso(new Date()), pavilions: crowdItems() }), 10_000);
      return () => { clearInterval(t); v.listeners.delete(onMessage); };
    },
    async spike(pid, wait) {
      crowd[pid] = wait;
      for (const [vid, v] of Object.entries(visitors)) {
        const next = v.route.stops[0];
        if (!next) continue;
        emit(v, { type: 'crowd_update', updated_at: iso(new Date()), pavilions: crowdItems() });
        const idx = v.route.stops.findIndex((s) => s.pavilion_id === pid);
        // like the API: only a jump of 10+ min over the plan alerts the visitor; a big one finds a better order
        if (idx < 0 || v.offered || wait - v.route.stops[idx].wait_min < 20) continue;
        // The alert reports the queue as it starts rising (design: "يرتفع · 24 د"); the offer then cites the forecast peak (38).
        const planned = v.route.stops[idx].wait_min;
        emit(v, { type: 'crowd_alert', pavilion_id: pid, wait_min: Math.round(planned + (wait - planned) * 0.45), planned_wait_min: planned });
        const offer = makeOffer(vid, v, pid, wait);
        if (offer) setTimeout(() => emit(v, offer), 1600);
      }
    },
  };
}

const pendingOffers: Record<string, Offer> = {};
let offerSeq = 0;

/** Visit the stop after the crowded one first (Japan ↔ Korea in the design): −26 min. */
function makeOffer(vid: string, v: V, pid: string, wait: number): Offer | null {
  const stops = v.route.stops;
  const i = stops.findIndex((s) => s.pavilion_id === pid);
  if (i < 0 || i + 1 >= stops.length) return null;
  v.offered = true;
  const crowded = stops[i], alt = stops[i + 1];
  const base = new Date(new Date(crowded.arrive_at).getTime() + 60_000);
  const altStop = stop(i + 1, alt.pavilion_id, base, 5, 10, 30, 75);
  const backStop = stop(i + 2, crowded.pavilion_id, addMin(altStop.leave_at, 7), 7, 12, crowded.visit_min, 80);
  const newStops = [...stops.slice(0, i), altStop, backStop, ...stops.slice(i + 2)].map((s, k) => ({ ...s, order: k + 1 }));
  const route: Route = { ...v.route, version: v.route.version + 1, stops: newStops };
  const offer: Offer = {
    type: 'reroute_offer', offer_id: `o_${++offerSeq}`, visitor_id: vid,
    expires_at: iso(new Date(Date.now() + 3 * 60_000)),
    reason: '', saves_min: 26,
    trigger: { pavilion_id: pid, wait_min: wait, planned_wait_min: crowded.wait_min },
    old: [{ pavilion_id: crowded.pavilion_id, arrive_at: crowded.arrive_at, wait_min: wait }, { pavilion_id: alt.pavilion_id, arrive_at: alt.arrive_at, wait_min: alt.wait_min }],
    new: [{ pavilion_id: alt.pavilion_id, arrive_at: altStop.arrive_at, wait_min: 10 }, { pavilion_id: crowded.pavilion_id, arrive_at: backStop.arrive_at, wait_min: 12 }],
    route,
  };
  pendingOffers[offer.offer_id] = offer;
  return offer;
}
