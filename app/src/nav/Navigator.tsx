/**
 * A small stack navigator that reproduces the Figma prototype's screen transitions:
 *   push     Figma "Push → Right" 350 ms ease-out: the new screen enters from the LEFT (RTL forward)
 *   back     the reverse: the current screen leaves to the left, the previous one comes back from the right
 *   dissolve 300 ms cross-fade
 *   moveIn   Figma "Move in ↑" 380 ms: the new screen rises from the bottom
 *   moveOut  the reverse of moveIn
 * Screens stay mounted while they are in the stack, so a step keeps its state when you come back to it.
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { SharedValue, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { M, SCREEN } from '../theme';

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

const DURATION: Record<Transition, number> = { push: 350, back: 350, dissolve: 300, fadeOut: 300, moveIn: 380, moveOut: 360, none: 0 };

let seq = 0;
const newKey = () => `s${++seq}`;

export function Navigator({ screens, initial }: { screens: Record<string, React.ComponentType<any>>; initial: string }) {
  const [stack, setStack] = useState<Entry[]>([{ key: newKey(), name: initial }]);
  const [anim, setAnim] = useState<Anim | null>(null);
  const p = useSharedValue(1);
  const busy = useRef(false);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const finish = useCallback((removeAfter?: string[]) => {
    if (removeAfter?.length) setStack((st) => st.filter((e) => !removeAfter.includes(e.key)));
    setAnim(null);
    busy.current = false;
  }, []);

  const run = useCallback((a: Anim) => {
    busy.current = true;
    setAnim(a);
    p.value = 0;
    const d = DURATION[a.type];
    if (d === 0) { p.value = 1; finish(a.removeAfter); return; }
    p.value = withTiming(1, { duration: d, easing: M.easeOut }, (done) => {
      if (done) runOnJS(finish)(a.removeAfter);
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
          const visible = role !== 'idle' || (!anim && e.key === topKey) || (anim?.type === 'back' && e.key === anim.to);
          const Screen = screens[e.name];
          return (
            <SceneView key={e.key} role={role} type={anim?.type ?? 'none'} p={p} visible={visible} interactive={!anim && e.key === topKey} back={anim?.type === 'back' || anim?.type === 'moveOut'}>
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

function SceneView({ role, type, p, visible, interactive, back, children }: {
  role: Role; type: Transition; p: SharedValue<number>; visible: boolean; interactive: boolean; back: boolean;
  children: React.ReactNode;
}) {
  const W = SCREEN.W, H = SCREEN.H;
  const style = useAnimatedStyle(() => {
    const t = p.value;
    if (role === 'idle') return { transform: [{ translateX: 0 }, { translateY: 0 }], opacity: 1 };
    switch (type) {
      case 'push':
        return role === 'in'
          ? { transform: [{ translateX: -W * (1 - t) }, { translateY: 0 }], opacity: 1 }
          : { transform: [{ translateX: W * t }, { translateY: 0 }], opacity: 1 };
      case 'back':
        return role === 'out'
          ? { transform: [{ translateX: -W * t }, { translateY: 0 }], opacity: 1 }
          : { transform: [{ translateX: W * (1 - t) }, { translateY: 0 }], opacity: 1 };
      case 'dissolve':
        return role === 'in'
          ? { transform: [{ translateX: 0 }, { translateY: 0 }], opacity: t }
          : { transform: [{ translateX: 0 }, { translateY: 0 }], opacity: 1 };
      case 'fadeOut':
        // going back with a cross-fade: the top screen fades away to reveal the one below
        return role === 'out'
          ? { transform: [{ translateX: 0 }, { translateY: 0 }], opacity: 1 - t }
          : { transform: [{ translateX: 0 }, { translateY: 0 }], opacity: 1 };
      case 'moveIn':
        return role === 'in'
          ? { transform: [{ translateX: 0 }, { translateY: H * (1 - t) }], opacity: 1 }
          : { transform: [{ translateX: 0 }, { translateY: 0 }], opacity: 1 };
      case 'moveOut':
        return role === 'out'
          ? { transform: [{ translateX: 0 }, { translateY: H * t }], opacity: 1 }
          : { transform: [{ translateX: 0 }, { translateY: 0 }], opacity: 1 };
      default:
        return { transform: [{ translateX: 0 }, { translateY: 0 }], opacity: role === 'in' ? 1 : 0 };
    }
  }, [role, type, back]);
  return (
    <Animated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, style, { display: visible ? 'flex' : 'none' }]}
    >
      {children}
    </Animated.View>
  );
}
