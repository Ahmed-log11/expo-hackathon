import { useCallback, useEffect, useRef, useState } from 'react';
import { type ApiError, toApiError } from './api';

export interface Poll<T> {
  data?: T;
  error?: ApiError;
  /** When the last good response arrived (Date.now()). */
  at?: number;
}

/**
 * Fetch now, then every `intervalMs` (null = only once). Keeps the last good data when a
 * request fails, so the screen never flashes empty. `refresh()` fetches right away; if a
 * request is in flight it runs once more after it, so a refresh is never lost.
 */
export function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number | null): [Poll<T>, () => void] {
  const [state, setState] = useState<Poll<T>>({});
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const flight = useRef({ busy: false, again: false });
  const mounted = useRef(true);

  const run = useCallback(async (queue: boolean) => {
    const f = flight.current;
    if (f.busy) {
      if (queue) f.again = true;
      return;
    }
    f.busy = true;
    do {
      f.again = false;
      try {
        const data = await fetchRef.current();
        if (mounted.current) setState({ data, at: Date.now() });
      } catch (e) {
        if (mounted.current) setState((s) => ({ ...s, error: toApiError(e) }));
      }
    } while (f.again && mounted.current);
    f.busy = false;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    void run(true);
    if (intervalMs === null) return;
    const id = window.setInterval(() => void run(false), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, run]);

  const refresh = useCallback(() => void run(true), [run]);
  return [state, refresh];
}

/** Date.now(), re-rendering every `ms` (for "updated 3 s ago"). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Run `fn` over `items`, at most `limit` at a time. */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
