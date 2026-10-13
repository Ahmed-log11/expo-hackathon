/**
 * The illustrated Expo map and everything drawn on it (Figma: Map/Expo Site, Map/Heat Overlay,
 * Route Line, Marker/Stop, Marker/Destination, Marker/Current Location).
 * All children use map coordinates (402 x 874 design units); the whole layer pans as the camera moves.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinear, Path, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing, SharedValue, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { C, M, ar, s, sf } from '../theme';
import { CROWD, CrowdLevel, Icon, Txt } from '../components/ui';
import { MAP_IMAGE } from '../assets/images';
import { Pt, lengthOf, toPath } from './route';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
const APath = Animated.createAnimatedComponent(Path);

/** The map plane: everything inside pans together (camera = vertical offset in design units). */
/** The map plane: pinch to zoom, drag to pan, double-tap to reset. camY still moves it from code. */
export function MapPlane({ camY, children, style }: { camY: SharedValue<number>; children?: React.ReactNode; style?: ViewStyle }) {
  const scale = useSharedValue(1), savedScale = useSharedValue(1);
  const tx = useSharedValue(0), ty = useSharedValue(0), sx = useSharedValue(0), sy = useSharedValue(0);

  const clamp = (v: number, lo: number, hi: number) => { 'worklet'; return Math.min(hi, Math.max(lo, v)); };
  const limX = (z: number) => { 'worklet'; return (s(402) * (z - 1)) / 2; };
  const limY = (z: number) => { 'worklet'; return (s(874) * (z - 1)) / 2 + s(250); };   // +250: see what's under the bottom sheet

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = clamp(savedScale.value * e.scale, 1, 3); })
    .onEnd(() => {
      savedScale.value = scale.value;
      tx.value = withTiming(clamp(tx.value, -limX(scale.value), limX(scale.value)));
      ty.value = withTiming(clamp(ty.value, -limY(scale.value), limY(scale.value)));
    });
  const pan = Gesture.Pan()
    .minDistance(5)
    .onStart(() => { sx.value = tx.value; sy.value = ty.value; })
    .onUpdate((e) => {
      tx.value = clamp(sx.value + e.translationX, -limX(scale.value), limX(scale.value));
      ty.value = clamp(sy.value + e.translationY, -limY(scale.value), limY(scale.value));
    });
  const reset = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    scale.value = withTiming(1); savedScale.value = 1; tx.value = withTiming(0); ty.value = withTiming(0);
  });
  const gesture = Gesture.Simultaneous(pinch, pan, reset);

  const a = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value + s(camY.value) }, { scale: scale.value }],
  }));
  return (
    <GestureDetector gesture={gesture}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.mapBg, overflow: 'hidden' }, style]}>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: s(402), height: s(874) }, a]}>
          <Image source={MAP_IMAGE} style={{ width: s(402), height: s(874) }} contentFit="fill" />
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

// ---------- heat (Map/Heat Overlay: soft blurred circles) ----------
type Spot = { color: string; r: number; op: number; blur: number };
const HEAT: Record<CrowdLevel, Spot[]> = {
  low: [{ color: C.low, r: 88, op: 0.18, blur: 52 }],
  moderate: [{ color: C.mod, r: 100, op: 0.2, blur: 60 }],
  busy: [{ color: C.busy, r: 130, op: 0.32, blur: 78 }, { color: C.critical, r: 60, op: 0.22, blur: 36 }],
  critical: [{ color: C.busy, r: 140, op: 0.36, blur: 80 }, { color: C.critical, r: 70, op: 0.28, blur: 40 }],
};

export function HeatSpot({ at, level, id }: { at: Pt; level: CrowdLevel; id: string }) {
  const spots = HEAT[level];
  const R = Math.max(...spots.map((sp) => sp.r + sp.blur * 1.1));
  const k = useSharedValue(0);
  useEffect(() => {
    // "Crowd hotspot intensifies (800 ms)"; a calm spot fades in quietly.
    k.value = 0;
    k.value = withTiming(1, { duration: level === 'busy' || level === 'critical' ? 800 : M.standard, easing: M.flowOut });
  }, [level]);
  const a = useAnimatedStyle(() => ({ opacity: k.value, transform: [{ scale: 0.85 + 0.15 * k.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: s(at.x - R), top: s(at.y - R), width: s(2 * R), height: s(2 * R) }, a]}>
      <Svg width={s(2 * R)} height={s(2 * R)} viewBox={`0 0 ${2 * R} ${2 * R}`}>
        <Defs>
          {spots.map((sp, i) => {
            const outer = sp.r + sp.blur * 1.1;
            return (
              <RadialGradient key={i} id={`h_${id}_${i}`} cx={R} cy={R} r={outer} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={sp.color} stopOpacity={sp.op} />
                <Stop offset={String(Math.max(0, (sp.r - sp.blur) / outer))} stopColor={sp.color} stopOpacity={sp.op} />
                <Stop offset={String(sp.r / outer)} stopColor={sp.color} stopOpacity={sp.op * 0.5} />
                <Stop offset="1" stopColor={sp.color} stopOpacity={0} />
              </RadialGradient>
            );
          })}
        </Defs>
        {spots.map((sp, i) => <Circle key={i} cx={R} cy={R} r={sp.r + sp.blur * 1.1} fill={`url(#h_${id}_${i})`} />)}
      </Svg>
    </Animated.View>
  );
}

// ---------- routes ----------
/** Route · Active: white casing 12, aqua 7 with a soft glow; draws on from the visitor (Motion/Route). */
export function ActiveRoute({ pts, drawKey, draw = true, shadeRuns = [], delay = 0, duration = 540 }: {
  pts: Pt[]; drawKey: string; draw?: boolean; shadeRuns?: Pt[][]; delay?: number; duration?: number;
}) {
  const d = toPath(pts);
  const len = lengthOf(pts) * 1.08 + 4;
  const p = useSharedValue(draw ? 0 : 1);
  const shade = useSharedValue(draw ? 0 : 1);
  useEffect(() => {
    if (!draw) { p.value = 1; shade.value = 1; return; }
    p.value = 0; shade.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration, easing: M.flowOut }));
    shade.value = withDelay(delay + duration, withTiming(1, { duration: M.standard }));   // shaded segments fade in after
  }, [drawKey]);
  const dash = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - p.value) }));
  const shadeProps = useAnimatedProps(() => ({ opacity: shade.value }));
  if (!d) return null;
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 402 874" pointerEvents="none">
      <APath d={d} stroke={C.aqua} strokeOpacity={0.14} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={len} animatedProps={dash} />
      <APath d={d} stroke={C.white} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={len} animatedProps={dash} />
      <APath d={d} stroke={C.aqua} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={len} animatedProps={dash} />
      <AG animatedProps={shadeProps}>
        {shadeRuns.map((r, i) => (
          <Path key={i} d={toPath(r)} stroke={C.white} strokeOpacity={0.95} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="0.1 7" fill="none" />
        ))}
      </AG>
    </Svg>
  );
}
const AG = Animated.createAnimatedComponent(G);

/** Route · Completed (muted) and Route · Previous (dark dotted, fading). */
export function PlainRoute({ pts, kind, fadeKey }: { pts: Pt[]; kind: 'completed' | 'previous'; fadeKey?: string }) {
  const o = useSharedValue(1);
  useEffect(() => {
    if (kind === 'previous') { o.value = 1; o.value = withTiming(0.8, { duration: 300 }); }
  }, [fadeKey]);
  const props = useAnimatedProps(() => ({ opacity: o.value }));
  const d = toPath(pts);
  if (!d) return null;
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 402 874" pointerEvents="none">
      {kind === 'completed'
        ? <Path d={d} stroke={C.muted} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        : <APath d={d} stroke="#0E5E59" strokeOpacity={0.8} strokeWidth={4} strokeLinecap="round" strokeDasharray="2 9" fill="none" animatedProps={props} />}
    </Svg>
  );
}

// ---------- markers ----------
const markerShadow = `0px ${s(2)}px ${s(8)}px rgba(8,38,36,0.06), 0px ${s(8)}px ${s(24)}px rgba(8,38,36,0.06)`;
const floatShadow = `0px ${s(12)}px ${s(40)}px rgba(8,38,36,0.16)`;
const MW = 240;   // layout box for centring a marker on its node

/** Labels stay this far inside the map's visible width (design units); the stem and node stay on the place. */
const EDGE = 10;
/** Slides a label sideways just enough to keep it on screen, once its width is known. */
function useEdgeShift(x: number, minLeft = EDGE) {
  const [w, setW] = React.useState(0);
  let dx = 0;
  if (w) {
    const half = w / 2 / s(1);
    if (x - half < minLeft) dx = minLeft - (x - half);
    else if (x + half > 402 - EDGE) dx = 402 - EDGE - (x + half);
  }
  return { dx: s(dx), onLayout: (e: { nativeEvent: { layout: { width: number } } }) => setW(e.nativeEvent.layout.width) };
}

/** Marker/Destination · Next: dark label, stem, aqua node. `minLeft` keeps the label right of an on-screen control column;
 * `below` hangs the label under the node when there is no room above it (status bar / top card). */
export function NextMarker({ at, name, meta, level, minLeft, below }: { at: Pt; name: string; meta: string; level: CrowdLevel; minLeft?: number; below?: boolean }) {
  const edge = useEdgeShift(at.x, minLeft);
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: s(at.x - MW / 2), top: s(below ? at.y - 8 : at.y - 74), width: s(MW), alignItems: 'center', flexDirection: below ? 'column-reverse' : 'column', justifyContent: 'flex-end' }}>
      <View onLayout={edge.onLayout} style={{ backgroundColor: C.deep, borderRadius: s(18), paddingHorizontal: s(14), paddingVertical: s(8), flexDirection: 'row', alignItems: 'center', gap: s(8), boxShadow: floatShadow, transform: [{ translateX: edge.dx }] }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt style={[ar(600, 15, 22), { color: C.white }]}>{name}</Txt>
          <Txt style={[ar(500, 12, 18), { color: C.mint }]}>{meta}</Txt>
        </View>
        <View style={{ width: s(8), height: s(8), borderRadius: s(4), backgroundColor: CROWD[level].dot }} />
      </View>
      <View style={{ width: s(2), height: s(10), backgroundColor: C.deep }} />
      <View style={{ width: s(16), height: s(16), borderRadius: s(8), backgroundColor: C.aqua, borderWidth: s(3), borderColor: C.white }} />
    </Animated.View>
  );
}

/** Marker/Destination · Pavilion: light label with wait, small node. `labelHidden` keeps only the node (label would collide). */
export function PavilionMarker({ at, name, meta, level, labelHidden }: { at: Pt; name: string; meta: string; level: CrowdLevel; labelHidden?: boolean }) {
  const edge = useEdgeShift(at.x);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: s(at.x - MW / 2), top: s(at.y - 63), width: s(MW), alignItems: 'center' }}>
      <View onLayout={edge.onLayout} style={{ opacity: labelHidden ? 0 : 1, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: s(1), borderColor: C.line, borderRadius: s(14), paddingHorizontal: s(10), paddingVertical: s(6), flexDirection: 'row', alignItems: 'center', gap: s(8), boxShadow: markerShadow, transform: [{ translateX: edge.dx }] }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt style={ar(600, 13, 19)}>{name}</Txt>
          <Txt style={[ar(500, 12, 18), { color: C.slate }]}>{meta}</Txt>
        </View>
        <View style={{ width: s(8), height: s(8), borderRadius: s(4), backgroundColor: CROWD[level].dot }} />
      </View>
      <View style={{ width: s(2), height: s(6), backgroundColor: labelHidden ? 'transparent' : C.muted }} />
      <View style={{ width: s(12), height: s(12), borderRadius: s(6), backgroundColor: C.white, borderWidth: s(2), borderColor: C.slate2 }} />
    </View>
  );
}

/** Label boxes in map units (node at the bottom centre), for collision checks before rendering. */
export const LABEL_BOX = { next: { w: 150, h: 74 }, pavilion: { w: 124, h: 63 } };
export type Rect = { x0: number; y0: number; x1: number; y1: number };
export function labelRect(at: Pt, kind: keyof typeof LABEL_BOX, below = false): Rect {
  const b = LABEL_BOX[kind];
  const x = Math.min(402 - EDGE - b.w / 2, Math.max(EDGE + b.w / 2, at.x));   // after the edge shift
  return below ? { x0: x - b.w / 2, x1: x + b.w / 2, y0: at.y - 8, y1: at.y - 8 + b.h } : { x0: x - b.w / 2, x1: x + b.w / 2, y0: at.y - b.h, y1: at.y };
}
export const overlaps = (a: Rect, b: Rect, pad = 4) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

/** Marker/Stop · Completed (muted, check) and numbered stops for the day plan. */
export function StopDot({ at, state, n, size = 30 }: { at: Pt; state: 'done' | 'next' | 'upcoming'; n?: number; size?: number }) {
  const base: ViewStyle = { position: 'absolute', left: s(at.x - size / 2), top: s(at.y - size / 2), width: s(size), height: s(size), borderRadius: s(size / 2), alignItems: 'center', justifyContent: 'center', boxShadow: markerShadow };
  if (state === 'done') {
    return <View pointerEvents="none" style={[base, { backgroundColor: C.muted, borderWidth: s(3), borderColor: C.white }]}><Icon name="check" size={16} color={C.white} /></View>;
  }
  const next = state === 'next';
  return (
    <View pointerEvents="none" style={[base, { backgroundColor: next ? C.aqua : C.white, borderWidth: s(next ? 3 : 2), borderColor: next ? C.white : C.deep }]}>
      <Txt style={[sf(700, 13, 19), { color: next ? C.ink : C.deep, textAlign: 'center' }]}>{String(n ?? '')}</Txt>
    </View>
  );
}

/** Marker/Current Location: halo, heading cone, ring, core, pulse. Pans smoothly between positions. */
export function CurrentLocation({ x, y, angle }: { x: SharedValue<number>; y: SharedValue<number>; angle: SharedValue<number> }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) })), -1);
  }, []);
  const pos = useAnimatedStyle(() => ({ transform: [{ translateX: s(x.value - 32) }, { translateY: s(y.value - 32) }] }));
  const cone = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value + 90}deg` }] }));
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + 0.12 * pulse.value }], opacity: 1 - 0.25 * pulse.value }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: s(64), height: s(64) }, pos]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: s(32), backgroundColor: 'rgba(32,204,184,0.18)' }, halo]} />
      <Animated.View style={[StyleSheet.absoluteFill, cone]}>
        <Svg width={s(64)} height={s(64)} viewBox="0 0 64 64">
          <Defs>
            <SvgLinear id="cone" x1="32" y1="1" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#20CCB8" stopOpacity={0} />
              <Stop offset="1" stopColor="#20CCB8" stopOpacity={0.55} />
            </SvgLinear>
          </Defs>
          <Path d="M32 32L18 4C27 0 37 0 46 4L32 32Z" fill="url(#cone)" stroke="#000" strokeOpacity={0.9} strokeWidth={1} />
        </Svg>
      </Animated.View>
      <View style={{ position: 'absolute', left: s(19), top: s(19), width: s(26), height: s(26), borderRadius: s(13), backgroundColor: C.white, boxShadow: floatShadow, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: s(18), height: s(18), borderRadius: s(9), backgroundColor: C.deep, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s(8), height: s(8), borderRadius: s(4), backgroundColor: C.aqua }} />
        </View>
      </View>
    </Animated.View>
  );
}
