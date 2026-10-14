/**
 * Talks to the INSYAB API (see contract/README.md). The app holds no routing logic: plans, waits,
 * reroute offers and the day summary all come from the backend.
 *
 * Set EXPO_PUBLIC_API_URL (for example http://192.168.1.20:8000 or the Render URL) to use the real API.
 * Without it the app runs in demo mode (data/mock.ts), which replays the design's story offline.
 */
import { mockBackend } from './mock';

export type Stop = {
  order: number;
  pavilion_id: string;
  walk_from_prev_min: number;
  walk_m?: number;
  arrive_at: string;
  wait_min: number;
  visit_min: number;
  leave_at: string;
  path: string[];
  landmarks: string[];
  shaded_pct: number;
};
export type Route = {
  visitor_id: string;
  version: number;
  generated_at: string;
  start_point: string;
  end_time: string;
  stops: Stop[];
  totals: { walk_min: number; wait_min: number; stops: number; distance_km?: number; baseline_wait_min?: number; saved_wait_min?: number };
  feasibility: { fits: number; requested: number; dropped: string[]; too_busy: string[] };
  summary: string | null;
};
export type WishItem = { pavilion_id: string; reason: string; source?: string };
export type NewVisitor = {
  interests?: string;
  interest_tags?: string[];
  must_visit?: string[];
  language?: 'ar' | 'en';
  start_time?: string;
  end_time?: string;
  start_point?: string;
  group_size?: number;
};
export type VisitorCreated = { visitor_id: string; language: string; wishlist: WishItem[]; wishlist_source: string; route: Route };
export type CrowdItem = { pavilion_id: string; wait_min: number; queue_length: number; status: 'low' | 'medium' | 'high' };
/** Expected wait now and in 30/60/90 minutes (GET /pavilions/{id}/forecast). */
export type ForecastPoint = { minutes: number; at: string; wait_min: number };
export type BriefStop = { pavilion_id: string; arrive_at: string; wait_min: number };
/** "Adjust my plan" (POST /visitors/{id}/adjust): what the AI understood and the plan it would give.
 *  preview_id is null when nothing could be changed; the reply then says what to try. */
export type AdjustChange = { action: 'remove' | 'add' | 'suggest' | 'end_time'; pavilion_id?: string; kind?: string; time?: string };
export type AdjustPreview = {
  preview_id: string | null; visitor_id: string; changes: AdjustChange[]; source: 'llm' | 'fallback' | string;
  reply: string; old: BriefStop[]; new: BriefStop[]; route: Route | null; expires_at?: string;
};
export type Offer = {
  type: 'reroute_offer';
  offer_id: string;
  visitor_id: string;
  expires_at: string;
  reason: string;
  saves_min: number;
  trigger: { pavilion_id: string; wait_min: number; planned_wait_min: number } | null;
  old: BriefStop[];
  new: BriefStop[];
  route: Route;
};
export type Summary = {
  visitor_id: string;
  as_of: string;
  visited: { pavilion_id: string; left_at: string; wait_min: number; wait_source: string; visit_min: number; walk_m?: number }[];
  remaining: string[];
  not_visited: string[];
  totals: { pavilions: number; wait_min: number; visit_min: number; distance_km: number; saved_min: number };
  saved_breakdown: { plan_min: number; reroutes_min: number };
  reroutes_accepted: number;
  eased: string[];
};
export type LiveMessage =
  | { type: 'crowd_update'; updated_at: string; pavilions: CrowdItem[] }
  | { type: 'crowd_alert'; pavilion_id: string; wait_min: number; planned_wait_min: number }
  | Offer
  | { type: 'reroute'; visitor_id: string; reason: string; saves_min: number; route: Route };

export interface Backend {
  mode: 'live' | 'demo';
  createVisitor(body: NewVisitor): Promise<VisitorCreated>;
  route(vid: string): Promise<Route>;
  event(vid: string, type: 'arrived' | 'entered' | 'left', pavilionId: string): Promise<void>;
  summary(vid: string): Promise<Summary>;
  accept(vid: string, offerId: string): Promise<Route>;
  decline(vid: string, offerId: string): Promise<void>;
  crowd(): Promise<CrowdItem[]>;
  /** The planner's wait forecast for one pavilion: ML model + latest observation + routed visitors. */
  forecast(pavilionId: string): Promise<ForecastPoint[]>;
  live(vid: string, onMessage: (m: LiveMessage) => void): () => void;
  /** "Adjust my plan": free text → a preview; nothing changes until acceptAdjust. */
  adjust(vid: string, text: string): Promise<AdjustPreview>;
  acceptAdjust(vid: string, previewId: string): Promise<Route>;
  cancelAdjust(vid: string, previewId: string): Promise<void>;
  /** Demo control: make a pavilion's measured wait jump (POST /debug/observe). */
  spike(pavilionId: string, waitMin: number): Promise<void>;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

function liveBackend(base: string): Backend {
  const token = process.env.EXPO_PUBLIC_DEMO_TOKEN;
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(base + path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(j?.error?.code ?? 'error', j?.error?.message ?? `HTTP ${r.status}`, r.status);
    return j as T;
  }
  return {
    mode: 'live',
    createVisitor: (body) => call('/visitors', { method: 'POST', body: JSON.stringify({ language: 'ar', ...body }) }),
    route: (vid) => call(`/visitors/${vid}/route`),
    event: async (vid, type, pavilion_id) => { await call(`/visitors/${vid}/events`, { method: 'POST', body: JSON.stringify({ type, pavilion_id }) }); },
    summary: (vid) => call(`/visitors/${vid}/summary`),
    accept: (vid, oid) => call(`/visitors/${vid}/offers/${oid}/accept`, { method: 'POST' }),
    decline: async (vid, oid) => { await call(`/visitors/${vid}/offers/${oid}/decline`, { method: 'POST' }); },
    crowd: async () => (await call<{ pavilions: CrowdItem[] }>('/crowd')).pavilions,
    forecast: (pid) => call(`/pavilions/${encodeURIComponent(pid)}/forecast`),
    adjust: (vid, text) => call(`/visitors/${vid}/adjust`, { method: 'POST', body: JSON.stringify({ text }) }),
    acceptAdjust: (vid, pid) => call(`/visitors/${vid}/adjust/${pid}/accept`, { method: 'POST' }),
    cancelAdjust: async (vid, pid) => { await call(`/visitors/${vid}/adjust/${pid}/cancel`, { method: 'POST' }); },
    live: (vid, onMessage) => {
      let ws: WebSocket | null = null;
      let closed = false;
      let retry: ReturnType<typeof setTimeout> | undefined;
      const open = () => {
        ws = new WebSocket(base.replace(/^http/, 'ws') + `/live/${vid}`);
        ws.onmessage = (e) => { try { onMessage(JSON.parse(String(e.data))); } catch {} };
        ws.onclose = () => { if (!closed) retry = setTimeout(open, 2000); };
      };
      open();
      return () => { closed = true; clearTimeout(retry); ws?.close(); };
    },
    spike: async (pavilion_id, wait_min) => {
      await call(`/debug/observe${token ? `?token=${encodeURIComponent(token)}` : ''}`, { method: 'POST', body: JSON.stringify({ pavilion_id, wait_min }) });
    },
  };
}

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/$/, '');
export const backend: Backend = BASE ? liveBackend(BASE) : mockBackend();
export const API_BASE = BASE;
