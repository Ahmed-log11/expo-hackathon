/**
 * 04 — Onboarding: Splash → Welcome, one continuous scene (Figma: Smart Animate 520 ms, continuity curve).
 * Splash choreography (Motion & Interaction · Patterns · Splash):
 *   0–380 incoming lines draw in from the left · 50–980 the two bands flow through their S-curves
 *   760–1100 top branch draws upward · 1080–1320 symbol settles 98→100% · 1000–1360 انسياب fades up 10pt
 *   1140–1480 INSYAB · hold · 2000 → Welcome (logo glides to the header, imagery fades in).
 */
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import Animated, { SharedValue,
  Easing, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import { C, M, VIEW_H, ar, s, useSafe } from '../theme';
import { Button, Txt } from '../components/ui';
import { LOCKUP_PARTS, SPLASH_LINES, WELCOME_ACCENT } from '../assets/svg';
import { PHOTOS } from '../assets/images';
import { useNav } from '../nav/Navigator';

const APath = Animated.createAnimatedComponent(Path);

// Lockup on the splash: 320 x 96 at (41, 365). In the Welcome header: 150 x 45 at (236, 62).
const L = { x: 41, y: 365, w: 320, h: 96 };
const H = { x: 236, y: 62, w: 150, h: 45 };
const VB = `0 0 ${LOCKUP_PARTS.viewBox[0]} ${LOCKUP_PARTS.viewBox[1]}`;

function LockupLayer({ paths, color }: { paths: { d: string; evenodd?: boolean }[]; color: string }) {
  return (
    <Svg width={s(L.w)} height={s(L.h)} viewBox={VB}>
      {paths.map((p, i) => <Path key={i} d={p.d} fill={color} fillRule={p.evenodd ? 'evenodd' : 'nonzero'} />)}
    </Svg>
  );
}

/** A band of the symbol revealed by a wipe: `fromLeft` grows the clip width, otherwise it grows upward. */
function Band({ index, box, progress, fromLeft = true }: { index: number; box: { x: number; y: number; w: number; h: number }; progress: SharedValue<number>; fromLeft?: boolean }) {
  const clip = useAnimatedStyle(() => (fromLeft
    ? { width: s(box.w) * progress.value }
    : { top: s(box.y + box.h) - s(box.h) * progress.value, height: s(box.h) * progress.value }));
  // The artwork stays put while its clip grows: pinned to the clip's left edge, or to its bottom edge.
  const inner = fromLeft
    ? { left: s(L.x - box.x), top: s(L.y - box.y) }
    : { left: s(L.x - box.x), bottom: s(box.y + box.h - (L.y + L.h)) };
  return (
    <Animated.View style={[
      { position: 'absolute', overflow: 'hidden', left: s(box.x) },
      fromLeft ? { top: s(box.y), height: s(box.h) } : { width: s(box.w) },
      clip,
    ]}>
      <View style={[{ position: 'absolute' }, inner]}>
        <LockupLayer paths={[LOCKUP_PARTS.symbol[index]]} color={C.aqua} />
      </View>
    </Animated.View>
  );
}

export default function Onboarding() {
  const nav = useNav();
  const safe = useSafe();
  const [phase, setPhase] = useState<'splash' | 'welcome'>('splash');
  const lines = useSharedValue(0);
  const bandsAB = useSharedValue(0);
  const bandC = useSharedValue(0);
  const bandD = useSharedValue(0);
  const settle = useSharedValue(0);
  const arIn = useSharedValue(0);
  const enIn = useSharedValue(0);
  const toWelcome = useSharedValue(0);
  const accent = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      const t = (v: SharedValue<number>, delay: number, dur: number, easing: any = M.flowOut) => {
        v.value = withDelay(reduced ? 0 : delay, withTiming(1, { duration: reduced ? 0 : dur, easing }));
      };
      if (reduced) {
        // Reduce Motion: logo fades in, 800 ms total, no line choreography.
        [lines, bandsAB, bandC, bandD, settle].forEach((v) => { v.value = 1; });
        arIn.value = withTiming(1, { duration: 400 }); enIn.value = withTiming(1, { duration: 400 });
      } else {
        t(lines, 0, 380, Easing.linear);
        t(bandsAB, 50, 930);
        t(bandC, 200, 780);
        t(bandD, 760, 340);
        t(settle, 1080, 240);
        t(arIn, 1000, 360);
        t(enIn, 1140, 340);
      }
      const hold = reduced ? 800 : 2000;
      setTimeout(() => {
        if (cancelled) return;
        setPhase('welcome');
        toWelcome.value = withTiming(1, { duration: reduced ? 200 : 520, easing: M.continuity });
        accent.value = withDelay(reduced ? 0 : 260, withTiming(1, { duration: reduced ? 0 : 700, easing: M.flowOut }));
      }, hold);
    });
    return () => { cancelled = true; };
  }, []);

  // Lockup glides from the splash centre to the Welcome header.
  const lockup = useAnimatedStyle(() => {
    const k = toWelcome.value;
    const scale = interpolate(k, [0, 1], [1, H.w / L.w]) * interpolate(settle.value, [0, 1], [0.98, 1]);
    // The layer scales around the screen centre O; translate so the lockup centre lands on its target.
    const O = { x: 201, y: VIEW_H / 2 };
    const Lc = { x: L.x + L.w / 2, y: L.y + L.h / 2 };
    const tx = interpolate(k, [0, 1], [Lc.x, H.x + H.w / 2]) - O.x - scale * (Lc.x - O.x);
    const ty = interpolate(k, [0, 1], [Lc.y, H.y + H.h / 2]) - O.y - scale * (Lc.y - O.y);
    return { transform: [{ translateX: s(tx) }, { translateY: s(ty) }, { scale }] };
  });
  const arStyle = useAnimatedStyle(() => ({ opacity: arIn.value, transform: [{ translateY: s(10 * (1 - arIn.value)) }] }));
  const enStyle = useAnimatedStyle(() => ({ opacity: enIn.value }));
  const splashOnly = useAnimatedStyle(() => ({ opacity: 1 - toWelcome.value }));
  const welcomeOnly = useAnimatedStyle(() => ({ opacity: toWelcome.value }));
  const content = useAnimatedStyle(() => ({ opacity: toWelcome.value, transform: [{ translateY: s(16 * (1 - toWelcome.value)) }] }));
  const accentProps = useAnimatedProps(() => ({ strokeDashoffset: WELCOME_ACCENT.len * (1 - accent.value) }));

  return (
    <View style={{ flex: 1, backgroundColor: C.deep }}>
      <StatusBar style="light" />

      {/* Welcome imagery fades in under the moving logo */}
      <Animated.View style={[StyleSheet.absoluteFill, welcomeOnly]} pointerEvents="none">
        <Image source={PHOTOS.hero} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient
          colors={['rgba(7,60,58,0.35)', 'rgba(7,60,58,0)', 'rgba(7,60,58,0.25)', 'rgba(7,60,58,0.95)']}
          locations={[0, 0.3, 0.55, 0.85]}
          style={StyleSheet.absoluteFill}
        />
        <Svg width={s(405)} height={s(54)} viewBox="0 0 405 54" style={{ position: 'absolute', left: 0, top: s(470) }}>
          <APath d={WELCOME_ACCENT.d} stroke={C.aqua} strokeOpacity={0.9} strokeWidth={3} strokeLinecap="round" fill="none"
            strokeDasharray={WELCOME_ACCENT.len} animatedProps={accentProps} />
        </Svg>
      </Animated.View>

      {/* Splash flow lines: crowded parallel lines that fan out */}
      <Animated.View style={[StyleSheet.absoluteFill, splashOnly]} pointerEvents="none">
        <Svg width={s(402)} height={s(874)} viewBox="0 0 402 874">
          {SPLASH_LINES.map((l, i) => <FlowLine key={i} d={l.d} len={l.len} opacity={l.opacity} progress={lines} />)}
        </Svg>
        <Txt style={[ar(400, 13, 21), { position: 'absolute', top: s(780), left: 0, right: 0, textAlign: 'center', color: 'rgba(207,245,237,0.7)' }]}>
          جزء من تجربة إكسبو 2030 الرياض
        </Txt>
      </Animated.View>

      {/* The lockup, built from its parts so each can animate */}
      <Animated.View style={[StyleSheet.absoluteFill, lockup]} pointerEvents="none">
        <Animated.View style={[{ position: 'absolute', left: s(L.x), top: s(L.y) }, arStyle]}>
          <LockupLayer paths={LOCKUP_PARTS.ar} color={C.white} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: s(L.x), top: s(L.y) }, enStyle]}>
          <LockupLayer paths={LOCKUP_PARTS.en} color={C.white} />
        </Animated.View>
        <Band index={1} box={{ x: 249, y: 396 - 6, w: 111, h: 46 + 12 }} progress={bandsAB} />
        <Band index={0} box={{ x: 249, y: 410 - 6, w: 111, h: 48 + 12 }} progress={bandsAB} />
        <Band index={2} box={{ x: 249, y: 424 - 4, w: 53, h: 10 + 8 }} progress={bandC} />
        <Band index={3} box={{ x: 306, y: 365 - 4, w: 56, h: 39 + 8 }} progress={bandD} fromLeft={false} />
      </Animated.View>

      {/* Welcome content */}
      {phase === 'welcome' && (
        <Animated.View style={[StyleSheet.absoluteFill, content]}>
          {/* Text and buttons stack from the bottom, so the text (taller than in Figma at the font's natural Arabic
              line height) always sits above the buttons instead of sliding under them from a fixed top. */}
          <View style={{ position: 'absolute', left: s(16), right: s(16), bottom: safe.ctaBottom }}>
            <View style={{ gap: s(8), marginBottom: s(24) }}>
              <Txt style={[ar(700, 34, 46), { color: C.white }]}>اقْضِ يومَكَ بانسياب</Txt>
              <Txt style={[ar(400, 17, 29), { color: 'rgba(255,255,255,0.88)' }]}>خطط زيارتك حسب اهتماماتك والازدحام المتوقع داخل إكسبو.</Txt>
            </View>
            <View style={{ gap: s(6), alignItems: 'center' }}>
              <Button label="ابدأ" variant="accent" style={{ alignSelf: 'stretch' }} onPress={() => nav.push('Permission', undefined, 'push')} />
              <Button label="تصفّح بدون خطة" variant="tertiary" textColor={C.white} size="medium" onPress={() => nav.push('Explore', undefined, 'dissolve')} />
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function FlowLine({ d, len, opacity, progress }: { d: string; len: number; opacity: number; progress: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - progress.value) }));
  return <APath d={d} stroke={C.aqua} strokeOpacity={opacity * 1.6} strokeWidth={1.5} fill="none" strokeDasharray={len} animatedProps={props} />;
}
