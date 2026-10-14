import { api, type ApiError, type Place, toApiError } from './api';

/** Requests in flight. A plan takes ~6 ms of server time, so this mainly hides network latency. */
export const SIM_CONCURRENCY = 6;

export interface SimState {
  total: number;
  done: number;
  failed: number;
  running: boolean;
  error?: ApiError;
}

/** 3-5 pavilions, popular ones more often (popularity 1-5 is the weight), like real wishlists. */
function pickPavilions(pavilions: Place[]): string[] {
  const pool = pavilions.map((p) => ({ id: p.id, w: p.popularity ?? 3 }));
  const k = 3 + Math.floor(Math.random() * 3);
  const picks: string[] = [];
  while (picks.length < k && pool.length) {
    let r = Math.random() * pool.reduce((s, p) => s + p.w, 0);
    const i = pool.findIndex((p) => (r -= p.w) < 0);
    picks.push(pool.splice(i < 0 ? pool.length - 1 : i, 1)[0].id);
  }
  return picks;
}

/**
 * Create `count` visitors through the real POST /visitors, exactly like the app does:
 * start now (the server's clock), leave after 4-6 hours, Arabic. Each plan is booked in the
 * ledger, so the dashboard's ledger view fills up as they land.
 */
export async function simulateVisitors(opts: {
  count: number;
  pavilions: Place[];
  serverNow: () => number;
  signal: AbortSignal;
  onProgress: (state: SimState) => void;
}): Promise<SimState> {
  const state: SimState = { total: opts.count, done: 0, failed: 0, running: true };
  let started = 0;

  const worker = async () => {
    while (started < state.total && !opts.signal.aborted) {
      if (state.failed >= 5 && state.done === 0) return;   // failing every time (Expo closed, server down): stop
      started++;
      const stayMin = 240 + 15 * Math.floor(Math.random() * 9);   // 4 h to 6 h
      try {
        await api.createVisitor({
          must_visit: pickPavilions(opts.pavilions),
          language: 'ar',
          end_time: new Date(opts.serverNow() + stayMin * 60_000).toISOString(),
        });
        state.done++;
      } catch (e) {
        state.failed++;
        state.error = toApiError(e);
      }
      opts.onProgress({ ...state });
    }
  };

  await Promise.all(Array.from({ length: SIM_CONCURRENCY }, worker));
  state.running = false;
  opts.onProgress({ ...state });
  return state;
}
