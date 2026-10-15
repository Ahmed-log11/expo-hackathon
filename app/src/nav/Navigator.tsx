/**
 * A small stack navigator. Screens never slide across the whole width: the journey stays in one place and
 * only what changes moves (INSYAB motion language, tokens in theme M).
 *   push     fade-through forward: the new screen fades in over the current one while drifting up M.drift
 *   back     fade-through back: the current screen fades out (drifting down slightly) over the previous one
 *   dissolve cross-fade (tabs, Generating → Plan Ready, Journey)
 *   moveIn   detail / arrival: rises a short distance and fades in, like a sheet settling
 *   moveOut  the reverse of moveIn
 * Identical chrome (status area, wizard nav bar, tab bar) sits in the same place on both screens and the
 * outgoing screen stays opaque underneath, so it reads as fixed while the content changes.
 * With Reduce Motion on, every transition is a short plain cross-fade.
 * Screens stay mounted while they are in the stack, so a step keeps its state when you come back to it.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { SharedValue, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { M, s } from '../theme';

export type Transition = 'push' | 'back' | 'dissolve' | 'fadeOut' | 'moveIn' | 'moveOut' | 'none';
export type Entry = { key: string; name: string; params?: any };

type Anim = { from?: string; to: string; type: Transition; removeAfter?: string[] };

type NavApi = {
  push: (name: string, params?: any, type?: Transition) => void;
  replace: (name: string, params?: any, type?: Transition) => void;
  reset: (name: string, params?: any, type?: Transition) => void;
  back: (type?: Transition) => void;
  top: Entry;
};

const NavCtx = createContext<NavApi | null>(null);
const RouteCtx = createContext<Entry | null>(null);

export const useNav = () => useContext(NavCtx)!;
export function useRoute<P = any>() {
  return useContext(RouteCtx) as Entry & { params: P };
}

const DURATION: Record<Transition, number> = {
  push: M.step, back: M.step, dissolve: M.quick + 20, fadeOut: M.quick + 20, moveIn: M.emphasized, moveOut: M.step + 20, none: 0,
};
const REDUCED_MS = 160;

let seq = 0;
// The time part keeps keys unique after a Fast Refresh resets `seq` while the stack keeps its old keys.
const newKey = () => `s${Date.now().toString(36)}-${++seq}`;

export function Navigator({ screens, initial }: { screens: Record<string, React.ComponentType<any>>; initial: string }) {
  const [stack, setStack] = useState<Entry[]>([{ key: newKey(), name: initial }]);
  const [anim, setAnim] = useState<Anim | null>(null);
  const p = useSharedValue(1);
  const busy = useRef(false);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const [reduced, setReduced] = useState(false);
  const reducedRef = useRef(false);
  useEffect(() => {
    const set = (v: boolean) => { reducedRef.current = v; setReduced(v); };
    AccessibilityInfo.isReduceMotionEnabled().then(set).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', set);
    return () => sub.remove();
  }, []);

  const finish = useCallback((removeAfter?: string[]) => {
    if (removeAfter?.length) setStack((st) => st.filter((e) => !removeAfter.includes(e.key)));
    setAnim(null);
    busy.current = false;
  }, []);

  const run = useCallback((a: Anim) => {
    busy.current = true;
    setAnim(a);
    p.value = 0;
    const d = a.type === 'none' ? 0 : reducedRef.current ? REDUCED_MS : DURATION[a.type];
    if (d === 0) { p.value = 1; finish(a.removeAfter); return; }
    const easing = a.type === 'moveIn' ? M.continuity : M.flowOut;
    // Start on the next frame: the incoming screen's first frame must render at p = 0 (no one-frame flash).
    requestAnimationFrame(() => {
      p.value = withTiming(1, { duration: d, easing }, (done) => {
        if (done) runOnJS(finish)(a.removeAfter);
      });
    });
  }, [finish, p]);

  const api = useMemo<NavApi>(() => ({
    top: stack[stack.length - 1],
    push: (name, params, type = 'push') => {
      if (busy.current) return;
      const from = stackRef.current[stackRef.current.length - 1];
      const e = { key: newKey(), name, params };
      setStack((st) => [...st, e]);
      run({ from: from.key, to: e.key, type });
    },
    replace: (name, params, type = 'dissolve') => {
      if (busy.current) return;
      const from = stackRef.current[stackRef.current.length - 1];
      const e = { key: newKey(), name, params };
      setStack((st) => [...st, e]);
      run({ from: from.key, to: e.key, type, removeAfter: [from.key] });
    },
    reset: (name, params, type = 'dissolve') => {
      if (busy.current) return;
      const old = stackRef.current;
      const e = { key: newKey(), name, params };
      setStack((st) => [...st, e]);
      run({ from: old[old.length - 1].key, to: e.key, type, removeAfter: old.map((o) => o.key) });
    },
    back: (type = 'back') => {
      if (busy.current) return;
      const st = stackRef.current;
      if (st.length < 2) return;
      const from = st[st.length - 1];
      const to = st[st.length - 2];
      run({ from: from.key, to: to.key, type, removeAfter: [from.key] });
    },
  }), [stack, run]);

  const topKey = stack[stack.length - 1].key;
  return (
    <NavCtx.Provider value={api}>
      <View style={StyleSheet.absoluteFill}>
        {stack.map((e) => {
          const role: Role = anim ? (e.key === anim.to ? 'in' : e.key === anim.from ? 'out' : 'idle') : 'idle';
          const visible = role !== 'idle' || (!anim && e.key === topKey);
          const Screen = screens[e.name];
          return (
            <SceneView key={e.key} role={role} type={anim?.type ?? 'none'} p={p} visible={visible} interactive={!anim && e.key === topKey} reduced={reduced}>
              <RouteCtx.Provider value={e}>
                <Screen />
              </RouteCtx.Provider>
            </SceneView>
          );
        })}
      </View>
    </NavCtx.Provider>
  );
}

type Role = 'in' | 'out' | 'idle';

function SceneView({ role, type, p, visible, interactive, reduced, children }: {
  role: Role; type: Transition; p: SharedValue<number>; visible: boolean; interactive: boolean; reduced: boolean;
  children: React.ReactNode;
}) {
  const drift = s(M.drift);
  const rise = s(48);                       // moveIn: a short rise, not the full screen height
  // Which screen moves: forward transitions animate the incoming (top) screen; back transitions the outgoing one.
  const leaving = type === 'back' || type === 'fadeOut' || type === 'moveOut';
  const style = useAnimatedStyle(() => {
    const t = p.value;
    const still = { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] };
    if (role === 'idle' || type === 'none') return still;
    const moving = leaving ? role === 'out' : role === 'in';
    if (!moving) return still;              // the screen underneath stays put and opaque
    const k = leaving ? t : 1 - t;          // 0 = settled, 1 = fully away
    if (reduced) return { opacity: 1 - k, transform: [{ translateY: 0 }, { scale: 1 }] };
    switch (type) {
      case 'push':
        return { opacity: 1 - k, transform: [{ translateY: drift * k }, { scale: 1 - 0.015 * k }] };
      case 'back':
        return { opacity: 1 - k, transform: [{ translateY: drift * 0.75 * k }, { scale: 1 - 0.015 * k }] };
      case 'moveIn':
      case 'moveOut':
        return { opacity: 1 - k, transform: [{ translateY: rise * k }, { scale: 1 }] };
      default:                              // dissolve, fadeOut
        return { opacity: 1 - k, transform: [{ translateY: 0 }, { scale: 1 }] };
    }
  }, [role, type, reduced, leaving]);
  // A screen that is about to fade in starts invisible on its very first frame (before the UI-thread
  // animation has taken over), so it never flashes at full opacity.
  const hiddenAtStart = role === 'in' && !leaving && type !== 'none';
  return (
    <Animated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, style, { display: visible ? 'flex' : 'none' }, hiddenAtStart ? { opacity: 0 } : null]}
    >
      {children}
    </Animated.View>
  );
}
