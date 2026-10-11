/**
 * Plan — Generating (balancing animation, status rotates every 700 ms, auto-continues at 2.4 s)
 * and Plan — Ready (mini map with the day route, time saved vs the usual order, stop timeline).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import Animated, { SharedValue,
  Easing, FadeIn, FadeInDown, FadeOut, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { C, M, VIEW_H, ar, s, sf } from '../theme';
import { Button, CROWD, CrowdPill, GlassButton, Icon, Txt, levelFor } from '../components/ui';
import { useNav } from '../nav/Navigator';
import { fmtDuration, fmtTime, useStore } from '../data/store';
import { nameOf, photoOf } from '../data/places';
import { GENERATING } from '../assets/svg';
import { MAP_IMAGE } from '../assets/images';
import { placePoint, toPath, walkThrough } from '../map/route';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);

// ---------- Generating ----------
const MESSAGES = ['نحلل الازدحام المتوقع', 'نوازن المسافات', 'نرتّب محطاتك'];

export function Generating() {
  const nav = useNav();
  const { createPlan } = useStore();
  const [msg, setMsg] = useState(0);
  const [failed, setFailed] = useState<string>();
  // One 1.8 s clock drives the loop: crowd lines converge (0–700 ms), then fan out into five balanced paths (600–1400 ms).
  const clock = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    clock.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) })), -1);
    const rot = setInterval(() => setMsg((m) => (m + 1) % MESSAGES.length), 700);
    const started = Date.now();
    let alive = true;
    createPlan()
      .then(() => {
        const wait = Math.max(0, M.generating - (Date.now() - started));
        setTimeout(() => alive && nav.replace('PlanReady', undefined, 'dissolve'), wait);
      })
      .catch((e) => alive && setFailed(e?.message ?? 'تعذّر إنشاء الخطة'));
    return () => { alive = false; clearInterval(rot); };
  }, []);

  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + 0.2 * pulse.value }], opacity: 1 - 0.35 * pulse.value }));
  return (
    <View style={{ flex: 1, backgroundColor: C.deep }}>
      <StatusBar style="light" />
      <Svg style={{ position: 'absolute', left: s(-59), top: s(120) }} width={s(520)} height={s(520)} viewBox="0 0 520 520">
        <Defs>
          <RadialGradient id="glow" cx="260" cy="260" r="260" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#20CCB8" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#20CCB8" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="260" cy="260" r="260" fill="url(#glow)" />
      </Svg>
      <View style={{ position: 'absolute', left: 0, top: s(110), width: s(402), height: s(440) }}>
        <Svg width={s(402)} height={s(440)} viewBox="0 0 402 440">
          {GENERATING.crowd.map((l, i) => <DrawPath key={`c${i}`} d={l.d} len={l.len} opacity={l.opacity} width={2} clock={clock} from={0} to={0.39} />)}
          {GENERATING.paths.map((l, i) => <DrawPath key={`p${i}`} d={l.d} len={l.len} opacity={l.opacity} width={l.width} clock={clock} from={0.33} to={0.78} />)}
          {GENERATING.nodes.map(([x, y], i) => <Node key={`n${i}`} x={x} y={y} clock={clock} />)}
        </Svg>
        <Animated.View style={[{ position: 'absolute', left: s(169), top: s(168), width: s(64), height: s(64), borderRadius: s(32), backgroundColor: 'rgba(32,205,184,0.14)' }, ring]} />
        <View style={{ position: 'absolute', left: s(187), top: s(186), width: s(28), height: s(28), borderRadius: s(14), backgroundColor: C.aqua, borderWidth: s(4), borderColor: C.deep }} />
      </View>
      <View style={{ position: 'absolute', left: s(51), width: s(300), top: s(600), alignItems: 'center', gap: s(20) }}>
        <Txt style={[ar(700, 22, 31), { color: C.white, textAlign: 'center' }]}>{failed ? 'تعذّر إنشاء الخطة' : 'نبني أفضل ترتيب ليومك…'}</Txt>
        <View style={{ height: s(28), alignSelf: 'stretch', alignItems: 'center' }}>
          {failed ? (
            <Txt style={[ar(400, 15, 24), { color: C.mint, textAlign: 'center' }]}>{failed}</Txt>
          ) : (
            <Animated.View key={msg} entering={FadeIn.duration(M.standard)} exiting={FadeOut.duration(M.fast)} style={{ position: 'absolute' }}>
              <Txt style={[ar(400, 17, 26), { color: C.mint, textAlign: 'center' }]}>{MESSAGES[msg]}</Txt>
            </Animated.View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: s(6) }}>
          {[0, 1, 2].map((i) => <View key={i} style={{ width: s(28), height: s(3), borderRadius: s(2), backgroundColor: C.aqua, opacity: i <= msg ? 1 : 0.3 }} />)}
        </View>
        {failed && <Button label="رجوع" variant="accent" size="medium" onPress={() => nav.back('fadeOut')} />}
      </View>
    </View>
  );
}

function DrawPath({ d, len, opacity, width, clock, from, to }: { d: string; len: number; opacity: number; width: number; clock: SharedValue<number>; from: number; to: number }) {
  const props = useAnimatedProps(() => {
    const p = Math.min(1, Math.max(0, (clock.value - from) / (to - from)));
    const e = 1 - Math.pow(1 - p, 3);   // flow-out
    return { strokeDashoffset: len * (1 - e) };
  });
  return <APath d={d} stroke={C.aqua} strokeOpacity={opacity} strokeWidth={width} strokeLinecap="round" fill="none" strokeDasharray={len} animatedProps={props} />;
}
function Node({ x, y, clock }: { x: number; y: number; clock: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ opacity: clock.value > 0.72 ? 1 : 0 }));
  return <ACircle cx={x} cy={y} r={5.5} fill={C.deep} stroke={C.aqua} strokeWidth={3} animatedProps={props} />;
}

// ---------- Plan Ready ----------
// The mini map shows the full site at 60% (241 x 524 at x = 80, y = -42).
const MINI = { x: 80, y: -42, k: 241 / 402 };

export function PlanReady() {
  const nav = useNav();
  const { route, crowd, plan } = useStore();
  const stops = route?.stops ?? [];
  const ids = stops.map((st) => st.pavilion_id);
  const line = useMemo(() => (ids.length ? walkThrough([route?.start_point ?? 'metro', ...ids]).slice(0) : []), [ids.join()]);
  const draw = useSharedValue(0);
  useEffect(() => { draw.value = withDelay(250, withTiming(1, { duration: 1200, easing: M.flowOut })); }, []);
  const len = useMemo(() => {
    let L = 0;
    for (let i = 1; i < line.length; i++) L += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
    return L * 1.08 + 4;
  }, [line]);
  const dash = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - draw.value) }));

  const totals = route?.totals;
  const saved = totals?.saved_wait_min ?? 0;
  const baseline = totals?.baseline_wait_min ?? totals?.wait_min ?? 0;
  const wait = totals?.wait_min ?? 0;
  const hours = Math.round((plan.end.getTime() - plan.start.getTime()) / 3600_000);
  const km = totals?.distance_km ?? 0;
  const yours = baseline > 0 ? Math.max(0.12, wait / baseline) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: C.mapBg }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: s(140) }} showsVerticalScrollIndicator={false} bounces>
        {/* mini map */}
        <View style={{ height: s(342), overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: s(MINI.x), top: s(MINI.y), width: s(241), height: s(524) }}>
            <Image source={MAP_IMAGE} style={{ width: s(241), height: s(524) }} contentFit="fill" />
            <Svg style={StyleSheet.absoluteFill} viewBox="0 0 402 874">
              <APath d={toPath(line)} stroke={C.white} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={len} animatedProps={dash} />
              <APath d={toPath(line)} stroke={C.aqua} strokeWidth={8.5} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={len} animatedProps={dash} />
            </Svg>
          </View>
          <LinearGradient colors={[C.mapBg, 'rgba(238,242,239,0)', 'rgba(238,242,239,0)', C.mapBg]} locations={[0, 0.18, 0.8, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          {ids.map((id, i) => {
            const p = placePoint(id);
            const x = MINI.x + p.x * MINI.k, y = MINI.y + p.y * MINI.k;
            return (
              <Animated.View key={id} entering={FadeIn.delay(350 + i * 140).duration(M.standard)} style={{
                position: 'absolute', left: s(x - 15), top: s(y - 15), width: s(30), height: s(30), borderRadius: s(15),
                backgroundColor: i === 0 ? C.aqua : C.white, borderWidth: s(i === 0 ? 3 : 2), borderColor: i === 0 ? C.white : C.deep,
                alignItems: 'center', justifyContent: 'center',
                boxShadow: `0px ${s(2)}px ${s(8)}px rgba(8,38,36,0.06), 0px ${s(8)}px ${s(24)}px rgba(8,38,36,0.06)`,
              }}>
                <Txt style={[sf(700, 13, 19), { color: i === 0 ? C.ink : C.deep, textAlign: 'center' }]}>{String(i + 1)}</Txt>
              </Animated.View>
            );
          })}
        </View>

        {/* plan sheet */}
        <View style={{
          marginTop: 0, backgroundColor: C.canvas, borderTopLeftRadius: s(32), borderTopRightRadius: s(32),
          paddingHorizontal: s(16), paddingTop: s(24), gap: s(20), minHeight: s(VIEW_H - 342),
          boxShadow: `0px ${s(12)}px ${s(40)}px rgba(8,38,36,0.16)`,
        }}>
          <View style={{ gap: s(8), alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
              <Txt style={ar(700, 34, 46)}>خطتك جاهزة</Txt>
              <View style={{ width: s(8), height: s(8), borderRadius: s(4), backgroundColor: C.aqua }} />
            </View>
            <View style={{ flexDirection: 'row', gap: s(8) }}>
              {[`${km} كم`, `${hours} ساعات`, `${stops.length} محطات`].map((t) => (
                <View key={t} style={{ height: s(36), borderRadius: s(14), backgroundColor: C.white, borderWidth: s(1), borderColor: C.line, paddingHorizontal: s(12), justifyContent: 'center' }}>
                  <Txt style={ar(600, 15, 22)}>{t}</Txt>
                </View>
              ))}
            </View>
          </View>

          {/* time saved vs the usual order */}
          <View style={{ backgroundColor: C.mint, borderRadius: s(24), padding: s(18), gap: s(12) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
              <View style={{ width: s(44), height: s(44), borderRadius: s(22), backgroundColor: C.deep, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="wait" size={24} color={C.aqua} />
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Txt style={[ar(400, 15, 24), { color: C.deep }]}>{saved > 0 ? 'قد توفر لك خطتك نحو' : 'ترتيبك الحالي هو الأقل انتظارًا'}</Txt>
                <Txt style={[ar(700, 22, 31), { color: C.deep }]}>{saved > 0 ? `${fmtDuration(saved)} من الانتظار` : `${fmtDuration(wait)} انتظار متوقع`}</Txt>
              </View>
            </View>
            <View style={{ gap: s(8) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{`${fmtDuration(baseline)} انتظار`}</Txt>
                <Txt style={[ar(400, 13, 21), { color: C.slate }]}>ترتيب معتاد</Txt>
              </View>
              <Bar fraction={1} color={C.muted} delay={300} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt style={[ar(600, 13, 19), { color: C.deep }]}>{`${fmtDuration(wait)} انتظار`}</Txt>
                <Txt style={[ar(600, 13, 19), { color: C.deep }]}>خطتك</Txt>
              </View>
              <Bar fraction={yours} color={C.aqua} delay={500} />
            </View>
          </View>

          {/* flow timeline */}
          <View>
            {stops.map((st, i) => {
              const w = crowd[st.pavilion_id] != null && i === 0 ? crowd[st.pavilion_id] : st.wait_min;
              const lvl = levelFor(w);
              const last = i === stops.length - 1;
              return (
                <Animated.View key={st.pavilion_id} entering={FadeInDown.delay(200 + i * 80).duration(M.sheet)} style={{ flexDirection: 'row', gap: s(12), height: s(83) }}>
                  <Image source={photoOf(st.pavilion_id)} style={{ width: s(52), height: s(52), borderRadius: s(14) }} contentFit="cover" />
                  <View style={{ flex: 1, paddingTop: s(2), gap: s(6) }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: s(8) }}>
                      <Txt style={[ar(600, 15, 22), { color: C.slate }]}>{fmtTime(st.arrive_at)}</Txt>
                      <Txt style={ar(600, 17, 27)} numberOfLines={1}>{nameOf(st.pavilion_id)}</Txt>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: s(8) }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(3) }}>
                        <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{`${st.walk_from_prev_min} د مشي`}</Txt>
                        <Icon name="walk" size={14} color={C.slate} />
                      </View>
                      <CrowdPill level={lvl} label={`${CROWD[lvl].word} · ${w} د`} />
                    </View>
                  </View>
                  <View style={{ width: s(30), alignItems: 'center' }}>
                    <View style={{
                      width: s(30), height: s(30), borderRadius: s(15), alignItems: 'center', justifyContent: 'center',
                      backgroundColor: i === 0 ? C.aqua : C.white, borderWidth: s(i === 0 ? 3 : 2), borderColor: i === 0 ? C.white : C.deep,
                      boxShadow: `0px ${s(2)}px ${s(8)}px rgba(8,38,36,0.06), 0px ${s(8)}px ${s(24)}px rgba(8,38,36,0.06)`,
                    }}>
                      <Txt style={[sf(700, 13, 19), { color: i === 0 ? C.ink : C.deep, textAlign: 'center' }]}>{String(i + 1)}</Txt>
                    </View>
                    {!last && <View style={{ width: s(3), flex: 1, borderRadius: s(2), backgroundColor: 'rgba(32,205,184,0.55)' }} />}
                  </View>
                </Animated.View>
              );
            })}
            {route?.feasibility?.dropped?.length ? (
              <Txt style={[ar(400, 13, 21), { color: C.slate, marginTop: s(4) }]}>
                {`ما يتسع وقتك لـ ${route.feasibility.dropped.length} من اختياراتك اليوم: ${route.feasibility.dropped.slice(0, 3).map(nameOf).join('، ')}`}
              </Txt>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* floating controls */}
      <GlassButton icon="chevron-right" style={{ position: 'absolute', right: s(16), top: s(60) }} onPress={() => nav.reset('Home', undefined, 'push')} />
      <GlassButton icon="heart" style={{ position: 'absolute', left: s(16), top: s(60) }} />
      <LinearGradient
        colors={['rgba(243,248,246,0)', C.canvas]}
        locations={[0, 0.3]}
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: s(16), paddingTop: s(28), paddingBottom: s(46) }}
      >
        <Button label="ابدأ الرحلة" icon="locate" variant="accent" disabled={!stops.length} onPress={() => nav.push('Journey', undefined, 'dissolve')} />
      </LinearGradient>
    </View>
  );
}

function Bar({ fraction, color, delay }: { fraction: number; color: string; delay: number }) {
  const k = useSharedValue(0);
  useEffect(() => { k.value = withDelay(delay, withTiming(1, { duration: 700, easing: M.flowOut })); }, []);
  // Bars grow from the right (RTL).
  const a = useAnimatedStyle(() => ({ width: `${fraction * 100 * k.value}%` }));
  return (
    <View style={{ height: s(6), flexDirection: 'row', justifyContent: 'flex-end' }}>
      <Animated.View style={[{ height: s(6), borderRadius: s(3), backgroundColor: color }, a]} />
    </View>
  );
}
