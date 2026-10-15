/**
 * 06 — Pavilion (Default + Wait Forecast sheet), 07 — Explore / Favorites / Notifications, 08 — Profile.
 * The wait forecast comes from GET /pavilions/{id}/forecast: the planner's own model (ML prior, latest
 * observation fading out, routed visitors). If that call fails, the rows are shaped from the current wait.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgLinear, Path, Stop } from 'react-native-svg';
import Animated, { FadeIn, FadeOut, LinearTransition, SlideInDown, SlideOutDown, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { C, M, ar, s, sf, useSafe } from '../theme';
import { Button, Chip, CrowdPill, CrowdStatus, Glass, GlassButton, Icon, Pressy, RoundButton, RtlScrollRow, Txt, crowdText, levelFor } from '../components/ui';
import { TabBar, useTabs } from '../components/tabs';
import { useNav, useRoute } from '../nav/Navigator';
import { AR_DAYS, AR_MONTHS, fmtTime, useStore } from '../data/store';
import type { Note } from '../data/store';
import { backend, ForecastPoint } from '../data/api';
import { PAVILION_IDS, PLACES, categoryOf, nameOf, photoOf, walkMinutes } from '../data/places';
import { PHOTOS } from '../assets/images';
import type { IconName } from '../assets/svg';

const APath = Animated.createAnimatedComponent(Path);
const raised = `0px ${s(2)}px ${s(8)}px rgba(8,38,36,0.06), 0px ${s(8)}px ${s(24)}px rgba(8,38,36,0.06)`;

// ---------- forecast (display) ----------
/** Fallback only, when the forecast endpoint can't be reached: now, +30, +60, +90 shaped like the design. */
function forecastFor(now: number) {
  return [now, Math.round(now * 2.8), Math.round(now * 1.6), Math.max(5, Math.round(now * 0.9))];
}
const LEVEL_WORD = (w: number) => crowdText.word(levelFor(w));

function Sparkline({ values }: { values: number[] }) {
  // RTL: "now" sits on the right; later times run toward the left.
  const W = 150, H = 64, top = 12, bottom = 60;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => ({ x: W - 5 - (i * (W - 10)) / (values.length - 1), y: bottom - ((v - min) / (max - min || 1)) * (bottom - top - 18) - 6 }));
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], mx = (a.x + b.x) / 2;
    d += ` C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
  }
  const area = `${d} L${pts[pts.length - 1].x} ${bottom} L${pts[0].x} ${bottom} Z`;
  const len = 260;
  const k = useSharedValue(0);
  useEffect(() => { k.value = withTiming(1, { duration: 700, easing: M.flowOut }); }, []);
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - k.value) }));
  return (
    <Svg width={s(W)} height={s(H)} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <SvgLinear id="area" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#20CCB8" stopOpacity={0.28} />
          <Stop offset="1" stopColor="#20CCB8" stopOpacity={0} />
        </SvgLinear>
      </Defs>
      <Path d={area} fill="url(#area)" />
      <APath d={d} stroke={C.deep} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeDasharray={len} animatedProps={props} />
      <Path d={`M${pts[0].x} ${pts[0].y} m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0`} fill={C.deep} stroke={C.white} strokeWidth={2} />
    </Svg>
  );
}

function WaitInsight({ wait, values, best }: { wait: number; values: number[]; best: string }) {
  const lvl = levelFor(wait);
  // Trend over the next 30 minutes, or over the hour when the first half hour is flat.
  const d30 = values[1] - wait, d60 = values[2] - wait;
  const soon = Math.abs(d30) > 5;
  const rising = soon ? d30 > 0 : d60 > 5;
  const falling = soon ? d30 < 0 : d60 < -5;
  const trend = rising ? (soon ? 'يرتفع خلال 30 دقيقة' : 'يرتفع خلال ساعة') : falling ? (soon ? 'ينخفض خلال 30 دقيقة' : 'ينخفض خلال ساعة') : 'مستقر خلال الساعة القادمة';
  const trendColor = rising ? C.busyText : C.lowText;
  return (
    <View style={{ backgroundColor: C.white, borderRadius: s(24), padding: s(18), gap: s(14), boxShadow: raised }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Sparkline key={values.join(',')} values={values} />
        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: s(4) }}>
            <Txt style={[ar(600, 17, 27), { color: C.slate }]}>د</Txt>
            <Txt style={[sf(700, 44, 48), { textAlign: 'left' }]}>{String(wait)}</Txt>
          </View>
          <Txt style={[ar(600, 13, 19), { color: C.slate }]}>الانتظار الآن</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <CrowdStatus wait={wait} level={lvl} variant="now" size="medium" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
          <Txt style={[ar(600, 15, 22), { color: trendColor }]}>{trend}</Txt>
          <Icon name="straight" size={16} color={trendColor} style={falling ? { transform: [{ rotate: '180deg' }] } : undefined} />
        </View>
      </View>
      <View style={{ backgroundColor: C.mint, borderRadius: s(16), paddingHorizontal: s(14), paddingVertical: s(12), flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: s(8) }}>
        <Txt style={[ar(600, 15, 22), { color: C.deep }]}>{`أفضل وقت للزيارة: ${best}`}</Txt>
        <Icon name="check" size={18} color={C.deep} />
      </View>
    </View>
  );
}

// ---------- Pavilion ----------
export function Pavilion() {
  const nav = useNav();
  const safe = useSafe();
  const { params } = useRoute<{ pid: string }>();
  const { crowd, route, plan, setPlan, favorites, toggleFavorite } = useStore();
  const pid = params?.pid ?? 'jp';
  const p = PLACES[pid];
  const live = crowd[pid];
  // The planner's forecast for this pavilion, fetched again whenever its live wait changes.
  // undefined = loading (flat line), 'error' = endpoint unreachable (shaped fallback).
  const [fc, setFc] = useState<ForecastPoint[] | 'error'>();
  useEffect(() => {
    let on = true;
    backend.forecast(pid)
      .then((f) => { if (on && f.length >= 4) setFc(f.slice(0, 4)); })
      .catch(() => { if (on) setFc((old) => (Array.isArray(old) ? old : 'error')); });
    return () => { on = false; };
  }, [pid, live]);
  const model = Array.isArray(fc) ? fc : undefined;
  const wait = model ? model[0].wait_min : live ?? 12;
  const values = model ? model.map((x) => x.wait_min) : fc === 'error' ? forecastFor(wait) : [wait, wait, wait, wait];
  const [sheet, setSheet] = useState(false);
  const [row, setRow] = useState(0);
  const inPlan = !!route?.stops.some((x) => x.pavilion_id === pid) || plan.mustVisit.includes(pid);
  const fav = favorites.includes(pid);
  const tags = (p?.tags ?? []).map((t) => ({ technology: 'التقنية', culture: 'الثقافة', planet: 'الاستدامة', humanity: 'الإنسانية', collaboration: 'التعاون' } as Record<string, string>)[t] ?? t);
  // Rows: the forecast's own times (now, +30, +60, +90); the fallback uses the next half-hour slots like the design.
  const now = new Date();
  const slot = new Date(now);
  slot.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  const times = model ? model.map((x) => new Date(x.at)) : [now, slot, new Date(slot.getTime() + 30 * 60_000), new Date(slot.getTime() + 60 * 60_000)];
  const lowNow = levelFor(wait) === 'low';
  const bestIdx = lowNow ? 0 : values.indexOf(Math.min(...values));
  const best = bestIdx === 0 ? `الآن – ${fmtTime(new Date(now.getTime() + 10 * 60_000))}` : `بعد ${fmtTime(times[bestIdx])}`;
  // The quietest later slot, for the note under the rows.
  const later = values.slice(1).reduce((b, v, i) => (v < values[b] ? i + 1 : b), 1);
  const eases = values[later] < values[0];

  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: safe.ctaBottom + s(56) + s(40) }} showsVerticalScrollIndicator={false}>
        <View style={{ height: s(380) }}>
          <Image source={photoOf(pid)} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={['rgba(5,31,28,0.45)', 'rgba(5,31,28,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: s(140) }} />
          <View style={{ position: 'absolute', right: s(16), top: s(292), backgroundColor: 'rgba(5,31,28,0.45)', borderRadius: s(10), paddingHorizontal: s(10), paddingVertical: s(4) }}>
            <Txt style={[ar(500, 12, 18), { color: C.white }]}>تصوّر معماري · إكسبو 2030 الرياض</Txt>
          </View>
        </View>
        <View style={{ marginTop: s(-50), backgroundColor: C.canvas, borderTopLeftRadius: s(32), borderTopRightRadius: s(32), paddingHorizontal: s(16), paddingTop: s(24), gap: s(18) }}>
          <View style={{ alignItems: 'flex-end', gap: s(8) }}>
            <Txt style={ar(700, 28, 38)}>{nameOf(pid)}</Txt>
            <View style={{ flexDirection: 'row', gap: s(6) }}>
              {tags.map((t) => (
                <View key={t} style={{ backgroundColor: '#E8F0ED', borderRadius: s(12), paddingHorizontal: s(10), paddingVertical: s(5) }}>
                  <Txt style={[ar(500, 13, 19), { color: C.slate }]}>{t}</Txt>
                </View>
              ))}
            </View>
          </View>
          <Pressy onPress={() => setSheet(true)} scaleTo={0.99}><WaitInsight wait={wait} values={values} best={bestIdx === 0 ? 'الآن' : fmtTime(times[bestIdx])} /></Pressy>
          <Pressable onPress={() => setSheet(true)} style={{ minHeight: s(27), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(2) }}>
              <Icon name="chevron-left" size={18} color={C.aquaText} />
              <Txt style={[ar(600, 15, 22), { color: C.aquaText }]}>التفاصيل</Txt>
            </View>
            <Txt style={ar(600, 17, 27)}>توقعات الساعة القادمة</Txt>
          </Pressable>
          <View style={{ gap: s(6) }}>
            <Txt style={ar(600, 17, 27)}>عن الجناح</Txt>
            <Txt style={[ar(400, 17, 29), { color: C.slate }]}>{`تجربة ${categoryOf(pid).split(' · ').join(' و')} تستكشف العلاقة بين الطبيعة والتصميم والتقنية، مع مساحات تفاعلية مناسبة لجميع الأعمار.`}</Txt>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {[{ t: 'وصول ميسّر', i: 'access' as IconName }, { t: `مدة الزيارة ${p?.avg_visit_min ?? 25} د`, i: 'eye' as IconName }, { t: `${walkMinutes('icon', pid)} د مشي`, i: 'walk' as IconName }].map((f) => (
              <View key={f.t} style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
                <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{f.t}</Txt>
                <Icon name={f.i} size={16} color={C.slate} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <GlassButton icon="chevron-right" level="clear" style={{ position: 'absolute', right: s(16), top: safe.top(56) }} onPress={() => nav.back('moveOut')} />
      <GlassButton icon="heart" level="clear" selected={fav} onPress={() => toggleFavorite(pid)} style={{ position: 'absolute', left: s(16), top: safe.top(56) }} />
      <LinearGradient colors={['rgba(243,248,246,0)', C.canvas]} locations={[0, 0.3]} pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: s(16), paddingTop: s(24), paddingBottom: safe.ctaBottom, flexDirection: 'row', gap: s(10) }}>
        <Button label={inPlan ? 'في خطتك' : 'أضف لخطتي'} icon={inPlan ? 'check' : 'plus'} variant="secondary" padX={12} style={{ flex: 140 }}
          onPress={() => { if (!inPlan) setPlan({ mustVisit: [...plan.mustVisit, pid] }); }} />
        <Button label="توجّه الآن" icon="locate" variant="accent" style={{ flex: 220 }} onPress={() => nav.back('moveOut')} />
      </LinearGradient>

      {/* Wait forecast sheet (Move in ↑ 380 ms over a dim) */}
      {sheet && (
        <>
          <Animated.View entering={FadeIn.duration(M.standard)} exiting={FadeOut.duration(M.standard)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,32,30,0.38)' }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet(false)} />
          </Animated.View>
          <Animated.View entering={SlideInDown.duration(M.emphasized).easing(M.continuity)} exiting={SlideOutDown.duration(M.sheet)}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: Math.max(s(249), safe.insetTop + s(16)), backgroundColor: C.canvas, borderTopLeftRadius: s(34), borderTopRightRadius: s(34), boxShadow: `0px ${s(12)}px ${s(40)}px rgba(8,38,36,0.16)` }}>
            {/* Header stays put; the forecast below scrolls when it is taller than the sheet. */}
            <View style={{ paddingHorizontal: s(16), paddingTop: s(8), paddingBottom: s(12), gap: s(12) }}>
              <View style={{ alignSelf: 'flex-end', width: s(36), height: s(5), borderRadius: s(3), backgroundColor: 'rgba(96,120,116,0.45)' }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Pressy onPress={() => setSheet(false)}>
                  <View style={{ width: s(44), height: s(44), borderRadius: s(22), backgroundColor: '#E8F0ED', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="close" size={20} color={C.ink} />
                  </View>
                </Pressy>
                <View style={{ alignItems: 'flex-end', gap: s(2) }}>
                  <Txt style={ar(700, 22, 31)}>توقعات الانتظار</Txt>
                  <Txt style={[ar(400, 15, 24), { color: C.slate }]}>{`${nameOf(pid)} · اليوم${model && backend.mode === 'live' ? ' · من نموذج تعلّم آلي' : ''}`}</Txt>
                </View>
              </View>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: s(16), paddingTop: s(4), paddingBottom: safe.insetBottom + s(24), gap: s(16) }} showsVerticalScrollIndicator={false}>
              <WaitInsight wait={values[row]} values={values.slice(row).concat(values.slice(0, row))} best={best} />
              <View style={{ backgroundColor: C.white, borderRadius: s(22), overflow: 'hidden' }}>
                {values.map((v, i) => {
                  const lvl = levelFor(v);
                  const on = row === i;
                  return (
                    <View key={i}>
                      {i > 0 && <View style={{ height: s(1), backgroundColor: C.line, marginHorizontal: s(16) }} />}
                      <Pressable onPress={() => setRow(i)}>
                        {/* RTL row: time on the right, then the wait; the crowd level sits at the far left. */}
                        <Animated.View layout={LinearTransition.duration(M.standard)} style={{ minHeight: s(56), flexDirection: 'row-reverse', alignItems: 'center', gap: s(12), paddingHorizontal: s(16), backgroundColor: on ? C.mint : 'transparent' }}>
                          <Txt style={[on ? ar(600, 17, 27) : ar(400, 17, 29), { minWidth: s(72) }]}>{i === 0 ? 'الآن' : fmtTime(times[i])}</Txt>
                          <Txt style={[ar(600, 17, 27), { color: on ? C.ink : C.slate, flex: 1 }]}>{`${v} د`}</Txt>
                          <CrowdPill level={lvl} label={crowdText.word(lvl)} style={{ alignSelf: 'center' }} />
                        </Animated.View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              <Txt style={[ar(400, 13, 21), { color: C.slate }]}>
                {eases ? `أو بعد ${fmtTime(times[later])} عندما يخف الازدحام` : 'لا نتوقع أن يخف الازدحام خلال الساعة والنصف القادمة'}
              </Txt>
            </ScrollView>
          </Animated.View>
        </>
      )}
    </View>
  );
}

// ---------- Explore ----------
const CATS = [{ k: 'all', l: 'الكل' }, { k: 'quiet', l: 'هادئ الآن' }, { k: 'technology', l: 'التقنية' }, { k: 'culture', l: 'الثقافة' }, { k: 'planet', l: 'الاستدامة' }];

export function Explore() {
  const nav = useNav();
  const safe = useSafe();
  const onTab = useTabs('explore');
  const { crowd } = useStore();
  const [cat, setCat] = useState('all');
  const quiet = useMemo(() => [...PAVILION_IDS]
    .filter((id) => cat === 'all' || cat === 'quiet' || (PLACES[id].tags ?? []).includes(cat))
    .sort((a, b) => (crowd[a] ?? 20) - (crowd[b] ?? 20) || (PLACES[b].popularity ?? 0) - (PLACES[a].popularity ?? 0))
    .slice(0, 8), [crowd, cat]);
  const near = useMemo(() => [...PAVILION_IDS].sort((a, b) => walkMinutes('icon', a) - walkMinutes('icon', b)).slice(0, 6), []);
  const lowCount = PAVILION_IDS.filter((id) => (crowd[id] ?? 20) < 15 && (PLACES[id].tags ?? []).includes('technology')).length;

  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar style="dark" />
      {/* Fixed header below the safe area: title + bell, search, category chips. Only the content under it scrolls,
          so nothing slides up under the status bar / Dynamic Island. */}
      <View style={{ paddingTop: safe.top(58), backgroundColor: C.canvas, zIndex: 1 }}>
        <View style={{ marginHorizontal: s(16), minHeight: s(46), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <RoundButton icon="bell" onPress={() => nav.push('Notifications')} />
          <Txt style={ar(700, 34, 46)}>استكشف</Txt>
        </View>
        <View style={{ marginTop: s(14), marginHorizontal: s(16), height: s(50), borderRadius: s(25), backgroundColor: '#E8F0ED', paddingHorizontal: s(16), flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
          <Txt style={[ar(400, 17, 29), { color: C.slate, flex: 1 }]}>ابحث عن جناح أو تجربة</Txt>
          <Icon name="search" size={22} color={C.slate} />
        </View>
        <RtlScrollRow style={{ marginTop: s(12), flexGrow: 0 }}>
          {CATS.map((c) => <Chip key={c.k} label={c.l} selected={cat === c.k} onPress={() => setCat(c.k)} />)}
        </RtlScrollRow>
        <LinearGradient pointerEvents="none" colors={[C.canvas, 'rgba(243,248,246,0)']} style={{ position: 'absolute', left: 0, right: 0, bottom: s(-14), height: s(14) }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: safe.tabClear }} showsVerticalScrollIndicator={false}>
        <Pressy style={{ marginTop: s(16), marginHorizontal: s(16) }} scaleTo={0.99}>
          <View style={{ height: s(196), borderRadius: s(26), overflow: 'hidden' }}>
            <Image source={PHOTOS.interactive} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={['rgba(5,31,28,0)', 'rgba(5,31,28,0.8)']} style={StyleSheet.absoluteFill} />
            <Glass level="clear" radius={14} style={{ position: 'absolute', right: s(14), top: s(14), height: s(33), paddingHorizontal: s(10), flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
              <Txt style={[ar(600, 13, 19), { color: C.white }]}>تجارب تناسب اهتماماتك</Txt>
              <Icon name="touch" size={16} color={C.white} />
            </Glass>
            <View style={{ position: 'absolute', left: s(24), right: s(16), bottom: s(16), gap: s(2) }}>
              <Txt style={[ar(700, 22, 31), { color: C.white }]}>التجارب التفاعلية</Txt>
              <Txt style={[ar(400, 15, 24), { color: 'rgba(255,255,255,0.9)' }]}>{`${Math.max(lowCount, 2)} تجارب قريبة · الانتظار منخفض الآن`}</Txt>
            </View>
          </View>
        </Pressy>
        <SectionHead title="هادئ الآن" onAll={() => nav.push('Favorites')} />
        <RtlScrollRow key={cat} gap={14}>
          {quiet.map((id) => <PavilionTile key={id} id={id} wait={crowd[id]} onPress={() => nav.push('Pavilion', { pid: id }, 'moveIn')} />)}
        </RtlScrollRow>
        <SectionHead title="قريب منك" onAll={() => nav.push('Favorites')} />
        <RtlScrollRow gap={14}>
          {near.map((id) => <PavilionTile key={id} id={id} wait={crowd[id]} onPress={() => nav.push('Pavilion', { pid: id }, 'moveIn')} />)}
        </RtlScrollRow>
      </ScrollView>
      <View style={{ position: 'absolute', left: s(16), right: s(16), bottom: safe.floatBottom }}>
        <TabBar selected="explore" onSelect={onTab} />
      </View>
    </View>
  );
}

function SectionHead({ title, onAll }: { title: string; onAll?: () => void }) {
  return (
    <View style={{ marginTop: s(22), marginBottom: s(12), marginHorizontal: s(16), minHeight: s(28), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Pressable onPress={onAll} style={{ flexDirection: 'row', alignItems: 'center', gap: s(2) }}>
        <Icon name="chevron-left" size={18} color={C.aquaText} />
        <Txt style={[ar(600, 15, 22), { color: C.aquaText }]}>الكل</Txt>
      </Pressable>
      <Txt style={ar(600, 20, 28)}>{title}</Txt>
    </View>
  );
}

function PavilionTile({ id, wait = 12, onPress }: { id: string; wait?: number; onPress: () => void }) {
  const { favorites, toggleFavorite } = useStore();
  const fav = favorites.includes(id);
  const lvl = levelFor(wait);
  return (
    <Pressy onPress={onPress} style={{ width: s(232) }} scaleTo={0.98}>
      <View style={{ height: s(156), borderRadius: s(22), overflow: 'hidden' }}>
        <Image source={photoOf(id)} style={StyleSheet.absoluteFill} contentFit="cover" />
        <Pressy onPress={() => toggleFavorite(id)} style={{ position: 'absolute', left: s(10), top: s(10) }} scaleTo={0.9}>
          <Glass level="clear" radius={22} fill={fav ? 'rgba(7,60,58,0.88)' : 'rgba(255,255,255,0.24)'} border="rgba(255,255,255,0.45)" style={{ width: s(44), height: s(44), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="heart" size={22} color={fav ? C.aqua : C.white} />
          </Glass>
        </Pressy>
      </View>
      <View style={{ marginTop: s(10), alignItems: 'flex-end', gap: s(4), paddingHorizontal: s(2) }}>
        <Txt style={ar(600, 17, 27)} numberOfLines={1}>{nameOf(id)}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(3) }}>
            <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{`${walkMinutes('icon', id)} د`}</Txt>
            <Icon name="walk" size={14} color={C.slate} />
          </View>
          <CrowdStatus wait={wait} level={lvl} />
        </View>
      </View>
    </Pressy>
  );
}

// ---------- Favorites ----------
function placesAr(n: number) {
  return n === 1 ? 'مكان واحد' : n === 2 ? 'مكانان' : n <= 10 ? `${n} أماكن` : `${n} مكانًا`;
}

export function Favorites() {
  const nav = useNav();
  const safe = useSafe();
  const onTab = useTabs('explore');
  const { crowd, route, plan, setPlan, favorites: saved, toggleFavorite } = useStore();
  const [expanded, setExpanded] = useState(() => saved[saved.length - 1] ?? '');
  const [added, setAdded] = useState<string[]>([]);
  const inPlan = (id: string) => !!route?.stops.some((x) => x.pavilion_id === id) || plan.mustVisit.includes(id) || added.includes(id);
  const busyOne = saved.find((id) => levelFor(crowd[id] ?? 12) === 'busy' || levelFor(crowd[id] ?? 12) === 'critical') ?? (saved.includes(expanded) ? expanded : '');
  // Header clears the status bar / Dynamic Island; the list below moves with it.
  const headerTop = safe.top(56);
  const listShift = headerTop - s(56);
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar style="dark" />
      <View style={{ position: 'absolute', left: s(16), top: headerTop, width: s(238), gap: s(4) }}>
        <View style={{ height: s(46), flexDirection: 'row', justifyContent: 'flex-end' }}>
          <RoundButton icon="chevron-right" onPress={() => nav.back()} />
        </View>
        <Txt style={ar(700, 34, 46)}>المحفوظة</Txt>
        <Txt style={[ar(400, 15, 24), { color: C.slate }]}>{saved.length ? `${placesAr(saved.length)} · نعرض لك حالة الازدحام مباشرة` : 'نعرض لك حالة الازدحام مباشرة'}</Txt>
      </View>
      {/* The list scrolls under the header and clears the tab bar, so the last card and the tip stay readable. */}
      <ScrollView style={{ position: 'absolute', left: 0, right: 0, top: s(256) + listShift, bottom: 0 }}
        contentContainerStyle={{ paddingBottom: safe.tabClear }} showsVerticalScrollIndicator={false}>
      <View style={{ marginLeft: s(16), width: s(328), gap: s(12) }}>
        {!saved.length && (
          <View style={{ width: s(370), backgroundColor: C.white, borderRadius: s(22), padding: s(18), gap: s(6), alignItems: 'flex-end', boxShadow: raised }}>
            <Icon name="heart" size={24} color={C.aquaText} />
            <Txt style={ar(600, 17, 27)}>لا توجد أماكن محفوظة بعد</Txt>
            <Txt style={[ar(400, 15, 24), { color: C.slate }]}>اضغط على القلب في أي جناح لحفظه هنا ومتابعة الازدحام فيه.</Txt>
          </View>
        )}
        {saved.map((id) => {
          const w = crowd[id] ?? 12, lvl = levelFor(w);
          const on = inPlan(id);
          const open = expanded === id;
          return (
            <Animated.View key={id} layout={LinearTransition.duration(M.sheet)} exiting={FadeOut.duration(M.sheet)} style={{ gap: s(8) }}>
              <Pressy onPress={() => setExpanded(open ? '' : id)} scaleTo={0.99}>
                <View style={{ minHeight: s(106), borderRadius: s(22), backgroundColor: C.white, padding: s(12), flexDirection: 'row', alignItems: 'center', gap: s(12), boxShadow: raised }}>
                  <View style={{ width: s(44), height: s(44), borderRadius: s(22), backgroundColor: on ? C.aqua : C.mint, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={on ? 'check' : 'plus'} size={20} color={on ? C.ink : C.aquaText} />
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end', gap: s(4) }}>
                    <Txt style={ar(600, 17, 27)}>{nameOf(id)}</Txt>
                    <Txt style={[ar(400, 13, 21), { color: C.slate }]} numberOfLines={1}>{`${categoryOf(id)} · ${on ? 'في خطتك' : lvl === 'busy' || lvl === 'critical' ? 'أفضل وقت بعد 8 م' : `${walkMinutes('icon', id)} د مشي`}`}</Txt>
                    <CrowdStatus wait={w} level={lvl} />
                  </View>
                  <Image source={photoOf(id)} style={{ width: s(76), height: s(76), borderRadius: s(16) }} contentFit="cover" />
                </View>
              </Pressy>
              {open && (
                <Animated.View entering={FadeIn.duration(M.standard)} style={{ flexDirection: 'row', gap: s(8) }}>
                  <Button label="إزالة" icon="trash" variant="tertiary" size="medium" style={{ flex: 1 }} onPress={() => toggleFavorite(id)} />
                  <Button label={on ? 'في خطتك' : 'أضف إلى خطتي'} icon={on ? 'check' : 'plus'} variant="secondary" size="medium" padX={8} style={{ flex: 1 }}
                    onPress={() => { if (!on) { setAdded((a) => [...a, id]); setPlan({ mustVisit: [...plan.mustVisit, id] }); } }} />
                </Animated.View>
              )}
            </Animated.View>
          );
        })}
        {!!busyOne && (
          <Animated.View layout={LinearTransition.duration(M.sheet)} style={{ width: s(370), backgroundColor: C.mint, borderRadius: s(18), padding: s(14), flexDirection: 'row-reverse', alignItems: 'center', gap: s(8) }}>
            <Icon name="clock" size={20} color={C.aquaText} />
            <Txt style={[ar(400, 15, 24), { color: C.deep, flex: 1 }]}>{`${nameOf(busyOne)} ${levelFor(crowd[busyOne] ?? 12) === 'low' ? 'هادئ الآن. وقت مناسب لإضافته.' : 'مزدحم الآن. نقترح إضافته بعد 8 م عندما يقل الانتظار.'}`}</Txt>
          </Animated.View>
        )}
      </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: s(16), right: s(16), bottom: safe.floatBottom }}>
        <TabBar selected="explore" onSelect={onTab} />
      </View>
    </View>
  );
}

// ---------- Notifications ----------
const NOTE_STYLE: Record<Note['kind'], { icon: IconName; bg: string; fg: string }> = {
  alert: { icon: 'crowd', bg: C.busyBg, fg: C.busyText },
  offer: { icon: 'clock', bg: C.mint, fg: C.aquaText },
  reroute: { icon: 'reroute', bg: C.deep, fg: C.aqua },
};

export function Notifications() {
  const nav = useNav();
  const safe = useSafe();
  // Header clears the status bar / Dynamic Island; the list below moves with it.
  const headerTop = safe.top(56);
  const listShift = headerTop - s(56);
  const { notes, visitorId } = useStore();
  // Everything the live connection told the visitor today, newest first.
  const items = [...notes].reverse().map((n) => ({
    ...n, ...NOTE_STYLE[n.kind], time: fmtTime(n.at),
    to: n.pid ? () => nav.push('Pavilion', { pid: n.pid }, 'moveIn') : undefined,
  }));
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar style="dark" />
      <View style={{ position: 'absolute', left: s(16), top: headerTop, width: s(195), gap: s(4) }}>
        <View style={{ height: s(46), flexDirection: 'row', justifyContent: 'flex-end' }}>
          <RoundButton icon="chevron-right" onPress={() => nav.back()} />
        </View>
        <Txt style={ar(700, 34, 46)}>التنبيهات</Txt>
        <Txt style={[ar(400, 15, 24), { color: C.slate }]}>نرسل لك المهم فقط أثناء زيارتك.</Txt>
      </View>
      <ScrollView style={{ position: 'absolute', left: 0, right: 0, top: s(256) + listShift, bottom: 0 }}
        contentContainerStyle={{ paddingHorizontal: s(16), paddingBottom: safe.insetBottom + s(24), gap: s(10) }} showsVerticalScrollIndicator={false}>
        <Txt style={[ar(600, 13, 19), { color: C.slate }]}>اليوم</Txt>
        {!items.length && (
          <View style={{ backgroundColor: C.white, borderRadius: s(22), padding: s(18), gap: s(6), alignItems: 'flex-end', boxShadow: raised }}>
            <Icon name="bell" size={24} color={C.aquaText} />
            <Txt style={ar(600, 17, 27)}>لا توجد تنبيهات بعد</Txt>
            <Txt style={[ar(400, 15, 24), { color: C.slate }]}>
              {visitorId ? 'ننبهك هنا عندما يتغيّر الازدحام في محطتك التالية أو نجد لك مسارًا أفضل.' : 'خطط يومك لتصلك تنبيهات الازدحام واقتراحات المسار أثناء زيارتك.'}
            </Txt>
          </View>
        )}
        {items.map((n, i) => (
          <Pressy key={n.id} onPress={n.to} scaleTo={0.99}>
            <Animated.View entering={FadeIn.delay(i * 70).duration(M.sheet)} style={{ backgroundColor: C.white, borderRadius: s(22), padding: s(16), flexDirection: 'row', gap: s(12), boxShadow: raised }}>
              <View style={{ flex: 1, gap: s(3) }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: s(8) }}>
                  <Txt style={[ar(500, 12, 18), { color: C.slate2 }]}>{n.time}</Txt>
                  <Txt style={[ar(600, 17, 27), { flex: 1 }]}>{n.title}</Txt>
                </View>
                <Txt style={[ar(400, 15, 24), { color: C.slate }]}>{n.body}</Txt>
              </View>
              <View style={{ width: s(42), height: s(42), borderRadius: s(20), backgroundColor: n.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={n.icon} size={22} color={n.fg} />
              </View>
            </Animated.View>
          </Pressy>
        ))}
        <View style={{ marginTop: s(10), backgroundColor: C.white, borderRadius: s(22), padding: s(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', boxShadow: raised }}>
          <Icon name="chevron-left" size={20} color={C.slate2} />
          <View style={{ alignItems: 'flex-end' }}>
            <Txt style={ar(600, 17, 27)}>تنبيهات انسياب</Txt>
            <Txt style={[ar(400, 13, 21), { color: C.slate }]}>المهمة فقط · 3 بالساعة كحد أقصى</Txt>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------- Profile ----------
function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  // RTL switch: on = knob on the left, aqua track.
  return (
    <Pressable onPress={onToggle}>
      <Animated.View style={{ width: s(51), height: s(31), borderRadius: s(16), backgroundColor: on ? C.aqua : '#E8F0ED', justifyContent: 'center' }}>
        <Animated.View layout={LinearTransition.duration(M.standard).easing(M.flowOut)} style={{ position: 'absolute', left: s(on ? 2 : 22), width: s(27), height: s(27), borderRadius: s(14), backgroundColor: C.white, boxShadow: `0px ${s(2)}px ${s(4)}px rgba(0,0,0,0.15)` }} />
      </Animated.View>
    </Pressable>
  );
}

function PrefRow({ icon, title, sub, value, toggle, onToggle, last }: { icon: IconName; title: string; sub?: string; value?: string; toggle?: boolean; onToggle?: () => void; last?: boolean }) {
  return (
    <>
      <View style={{ minHeight: s(sub ? 74 : 58), paddingHorizontal: s(14), paddingVertical: s(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {toggle != null ? <Switch on={toggle} onToggle={onToggle!} /> : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
            <Icon name="chevron-left" size={18} color={C.slate2} />
            <Txt style={[ar(400, 17, 29), { color: C.slate }]}>{value}</Txt>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt style={ar(400, 17, 29)}>{title}</Txt>
            {sub ? <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{sub}</Txt> : null}
          </View>
          <View style={{ width: s(34), height: s(34), borderRadius: s(10), backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={20} color={C.aquaText} />
          </View>
        </View>
      </View>
      {!last && <View style={{ height: s(1), backgroundColor: C.line, marginRight: s(52) }} />}
    </>
  );
}

export function Profile() {
  const safe = useSafe();
  const onTab = useTabs('profile');
  const { plan, setPlan } = useStore();
  const has = (k: string) => plan.comfort.includes(k);
  const flip = (k: string) => setPlan({ comfort: has(k) ? plan.comfort.filter((x) => x !== k) : [...plan.comfort, k] });
  const d = plan.start;
  const group = (title: string, rows: React.ReactNode) => (
    <View style={{ gap: s(8) }}>
      <Txt style={[ar(600, 13, 19), { color: C.slate }]}>{title}</Txt>
      <View style={{ backgroundColor: C.white, borderRadius: s(20) }}>{rows}</View>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: safe.top(58), paddingHorizontal: s(16), paddingBottom: safe.tabClear, gap: s(20) }} showsVerticalScrollIndicator={false}>
        <Txt style={ar(700, 34, 46)}>حسابي</Txt>
        <View style={{ minHeight: s(82), borderRadius: s(22), backgroundColor: C.deep, padding: s(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ width: s(48), height: s(48), borderRadius: s(26), backgroundColor: C.aqua, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="person" size={24} color={C.ink} />
          </View>
          <View style={{ alignItems: 'flex-end', gap: s(2) }}>
            <Txt style={[ar(600, 17, 27), { color: C.white }]}>زائر إكسبو</Txt>
            <Txt style={[ar(400, 13, 21), { color: C.mint }]}>{`تذكرة يومية · ${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]}`}</Txt>
          </View>
        </View>
        {group('تفضيلات المسار', <>
          <PrefRow icon="walk" title="المشي" value={has('less_walk') ? 'أقل' : 'متوسط'} />
          <PrefRow icon="shade" title="مسارات مظللة" sub="نفضّلها وقت الحر" toggle={has('shade')} onToggle={() => flip('shade')} />
          <PrefRow icon="access" title="سهولة الوصول" sub="مسارات بلا درج" toggle={has('access')} onToggle={() => flip('access')} />
          <PrefRow icon="family" title="مناسب للعائلة" toggle={has('family')} onToggle={() => flip('family')} last />
        </>)}
        {group('التطبيق', <>
          <PrefRow icon="globe" title="اللغة" value="العربية" />
          <PrefRow icon="bell" title="التنبيهات" value="المهمة فقط" last />
        </>)}
        {group('الخصوصية', <>
          <PrefRow icon="pin" title="الموقع" value="أثناء الاستخدام" />
          <PrefRow icon="lock" title="بياناتك" value="لا نشاركها" last />
        </>)}
      </ScrollView>
      <View style={{ position: 'absolute', left: s(16), right: s(16), bottom: safe.floatBottom }}>
        <TabBar selected="profile" onSelect={onTab} />
      </View>
    </View>
  );
}
