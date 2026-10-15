/**
 * INSYAB API client for the operator dashboard.
 * Base URL, first match wins: ?api=... in the page URL, VITE_API_URL, the live Render API.
 */
const DEFAULT_API = 'https://insyab-api.onrender.com';

export const API_URL = (
  new URLSearchParams(window.location.search).get('api') || import.meta.env.VITE_API_URL || DEFAULT_API
).replace(/\/+$/, '');

export type Status = 'low' | 'medium' | 'high';

/** The parts of a GET /pavilions entry the dashboard uses (popularity weights the simulated wishlists). */
export interface Place { id: string; name_ar: string; popularity?: number }

export interface Site { pavilions: Place[] }

export interface PavilionCrowd { pavilion_id: string; wait_min: number; queue_length: number; status: Status }

export interface Crowd { updated_at: string; pavilions: PavilionCrowd[] }

/** One step of GET /pavilions/{id}/forecast: the expected wait `minutes` from now. */
export interface ForecastPoint { minutes: number; at: string; wait_min: number }

/** GET /admin/stats (added for this dashboard). */
export interface AdminStats {
  as_of: string;
  visitors: { total: number; active: number; connected?: number };
  offers: { sent: number; open: number; accepted: number; accepted_saved_min: number };
  saved_min_total: number;
  avg_wait_min: number;
  bucket_min: number;
  buckets: string[];
  pavilions: (PavilionCrowd & { routed_next_2h: number[] })[];
}

export interface NewVisitor { must_visit: string[]; language: 'ar' | 'en'; end_time: string }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function toApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError(0, 'network', e instanceof Error ? e.message : String(e));
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 25_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API_URL + path, { ...init, signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = body?.error ?? {};
      throw new ApiError(res.status, err.code ?? `http_${res.status}`, err.message ?? res.statusText);
    }
    if (body === null) throw new ApiError(res.status, 'bad_response', 'The server sent no JSON');
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, ctrl.signal.aborted ? 'timeout' : 'network', e instanceof Error ? e.message : String(e));
  } finally {
    window.clearTimeout(timer);
  }
}

/** JSON POST. No Content-Type on GETs, so reads stay simple CORS requests (no preflight). */
const post = (body?: unknown): RequestInit => (body === undefined ? { method: 'POST' } : {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

/** /debug/* endpoints take ?token= when the server sets DEMO_TOKEN. */
const debug = (path: string, token: string) => (token ? `${path}?token=${encodeURIComponent(token)}` : path);

export const api = {
  site: () => call<Site>('/pavilions'),
  crowd: () => call<Crowd>('/crowd'),
  stats: () => call<AdminStats>('/admin/stats'),
  forecast: (pid: string) => call<ForecastPoint[]>(`/pavilions/${encodeURIComponent(pid)}/forecast`),
  createVisitor: (body: NewVisitor) => call<{ visitor_id: string }>('/visitors', post(body)),
  observe: (pid: string, waitMin: number, token: string) =>
    call<{ alerts: number; offers: number }>(debug('/debug/observe', token), post({ pavilion_id: pid, wait_min: waitMin })),
  reset: (token: string) => call<{ ok: boolean }>(debug('/debug/reset', token), post()),
};
