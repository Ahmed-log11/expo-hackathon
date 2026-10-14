import { createContext, useContext, useMemo, useState, type PointerEvent, type ReactNode } from 'react';

/** Value first (strong), then what it is: the reader already knows the mark, they want the number. */
export interface Tip { value: string; label: string; note?: string }

interface TipApi {
  show: (e: PointerEvent, tip: Tip) => void;
  hide: () => void;
}

const Ctx = createContext<TipApi | null>(null);

/** One shared tooltip that follows the pointer, for heat cells, map pins and sparklines. */
export function TipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<(Tip & { x: number; y: number }) | null>(null);
  const api = useMemo<TipApi>(() => ({
    show: (e, t) => setTip({ ...t, x: e.clientX, y: e.clientY }),
    hide: () => setTip(null),
  }), []);
  const left = tip ? Math.min(Math.max(tip.x, 150), window.innerWidth - 150) : 0;
  return (
    <Ctx.Provider value={api}>
      {children}
      {tip && (
        <div className="tip" role="tooltip" style={{ left, top: tip.y }}>
          <strong>{tip.value}</strong>
          <span>{tip.label}</span>
          {tip.note && <small>{tip.note}</small>}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useTip(): TipApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTip must be used inside <TipProvider>');
  return ctx;
}
