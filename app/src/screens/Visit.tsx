/**
 * Arrival — Arrived · Arrival — Visit Complete · Day — Summary.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { C, M, SCREEN, VIEW_H, ar, s, useSafe } from '../theme';
import { Button, CrowdPill, CrowdStatus, Glass, GlassButton, Icon, Pressy, Txt, crowdText, levelFor } from '../components/ui';
import { useNav, useRoute } from '../nav/Navigator';
import { AR_DAYS, AR_MONTHS, fmtTime, useStore } from '../data/store';
import { categoryOf, nameOf, photoOf, walkMinutes } from '../data/places';
import { PHOTOS } from '../assets/images';

// ---------- Arrived ----------
export function Arrived() {
  const nav = useNav();
  const safe = useSafe();
  const { params } = useRoute<{ pid: string }>();
  const { route, done, crowd, event } = useStore();
  const pid = params?.pid ?? route?.stops[0]?.pavilion_id ?? 'kr';
  const stop = route?.stops.find((x) => x.pavilion_id === pid);
  const total = done.length + (route?.stops.length ?? 0);
  const waitNow = crowd[pid] ?? stop?.wait_min ?? 0;
  const planned = stop?.wait_min ?? waitNow;
  const lvl = levelFor(waitNow);
  const [busy, setBusy] = useState(false);
  const once = useRef(false);   // a double tap must not send the events or navigate twice
  // The panel is anchored to the bottom and sized by its content (at least the design's 500-from-top), so long
  // notes never slide under the buttons; the title and caption ride just above it.
  const [ctaH, setCtaH] = useState(s(104));
  const [panelH, setPanelH] = useState(SCREEN.H - s(500));

  const start = async () => {
    if (once.current) return;
    once.current = true;
    setBusy(true);
    await event('arrived', pid);
    await event('entered', pid);
    nav.replace('VisitComplete', { pid }, 'dissolve');
  };

  const stat = (label: string, value: React.ReactNode, foot: string) => (
    <View style={{ flex: 1, minHeight: s(111), backgroundColor: C.white, borderRadius: s(20), padding: s(14), gap: s(6), alignItems: 'flex-end' }}>
      <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{label}</Txt>
      <View style={{ minHeight: s(40), justifyContent: 'center', alignItems: 'flex-end' }}>{value}</View>
      <Txt style={[ar(500, 12, 18), { color: C.slate2 }]}>{foot}</Txt>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar style="light" />
      <View style={{ height: s(520) }}>
        <Image source={photoOf(pid)} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={['rgba(5,31,28,0.35)', 'rgba(5,31,28,0)', 'rgba(5,31,28,0.15)', 'rgba(5,31,28,0.85)']} locations={[0, 0.3, 0.55, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <View style={{ position: 'absolute', left: s(16), bottom: panelH + s(16), backgroundColor: 'rgba(5,31,28,0.45)', borderRadius: s(10), paddingHorizontal: s(10), paddingVertical: s(4) }}>
        <Txt style={[ar(500, 12, 18), { color: C.white }]}>تصوّر معماري · إكسبو 2030 الرياض</Txt>
      </View>
      <Animated.View entering={FadeInDown.delay(120).duration(M.sheet)} style={{ position: 'absolute', left: s(16), right: s(16), bottom: panelH + s(14), gap: s(2) }}>
        <Txt style={[ar(700, 34, 46), { color: C.white }]}>وصلت</Txt>
        <Txt style={[ar(700, 22, 31), { color: 'rgba(255,255,255,0.9)' }]}>{nameOf(pid)}</Txt>
      </Animated.View>
      <GlassButton icon="chevron-right" level="clear" style={{ position: 'absolute', right: s(16), top: safe.top(56) }} onPress={() => nav.back('moveOut')} />
      <Glass level="clear" radius={20} fill="rgba(255,255,255,0.2)" border="rgba(255,255,255,0.38)"
        style={{ position: 'absolute', left: s(16), top: safe.top(56) + s(5.5), height: s(37), paddingHorizontal: s(14), flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
        <Txt style={[ar(600, 13, 19), { color: C.white }]}>{`المحطة ${done.length + 1} من ${total}`}</Txt>
        <View style={{ width: s(18), height: s(18), borderRadius: s(9), backgroundColor: C.aqua, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={14} color={C.ink} />
        </View>
      </Glass>

      <View onLayout={(e) => setPanelH(e.nativeEvent.layout.height)} style={{ position: 'absolute', minHeight: SCREEN.H - s(500), left: 0, right: 0, bottom: 0, backgroundColor: C.canvas, borderTopLeftRadius: s(30), borderTopRightRadius: s(30), paddingHorizontal: s(16), paddingTop: s(20), paddingBottom: safe.ctaBottom - s(6) + ctaH + s(14), gap: s(14) }}>
        <View style={{ flexDirection: 'row', gap: s(10) }}>
          {stat('مدة الزيارة', <Txt style={ar(700, 22, 31)}>{`${stop?.visit_min ?? 30} د`}</Txt>, 'تقريبًا')}
          {stat('الحالة', <CrowdPill level={lvl} size="medium" label={crowdText.word(lvl)} />, waitNow <= planned ? 'الطابور يتحرك' : 'الطابور أبطأ قليلًا')}
          {stat('الانتظار الآن', <Txt style={ar(700, 22, 31)}>{`${waitNow} د`}</Txt>, waitNow < planned ? 'أقل من المتوقع' : waitNow === planned ? 'كما توقعنا' : 'أعلى قليلًا من المتوقع')}
        </View>
        <View style={{ backgroundColor: C.mint, borderRadius: s(18), padding: s(14), flexDirection: 'row-reverse', alignItems: 'center', gap: s(10) }}>
          <Icon name="bell" size={20} color={C.aquaText} />
          <Txt style={[ar(400, 15, 24), { color: C.deep, flex: 1 }]}>خطتك محفوظة. ننبهك قبل موعد محطتك التالية بخمس دقائق.</Txt>
        </View>
      </View>

      <View onLayout={(e) => setCtaH(e.nativeEvent.layout.height)} style={{ position: 'absolute', left: s(16), right: s(16), bottom: safe.ctaBottom - s(6), gap: s(4), alignItems: 'center' }}>
        <Button label="بدأت الزيارة" icon="eye" variant="accent" disabled={busy} style={{ alignSelf: 'stretch' }} onPress={start} />
        <Button label="عرض تفاصيل الجناح" variant="tertiary" size="medium" />
      </View>
    </View>
  );
}

// ---------- Visit Complete ----------
export function VisitComplete() {
  const nav = useNav();
  const safe = useSafe();
  const { params } = useRoute<{ pid: string }>();
  const { route, done, crowd, event, savedByReroutes, mode } = useStore();
  const pid = params?.pid ?? 'kr';
  const stops = route?.stops ?? [];
  const cur = stops.find((x) => x.pavilion_id === pid);
  const next = stops.find((x) => x.pavilion_id !== pid);
  const total = done.length + stops.length;
  const spent = mode === 'demo' && pid === 'kr' ? 31 : cur?.visit_min ?? 25;
  const waited = mode === 'demo' && pid === 'kr' ? 9 : crowd[pid] ?? cur?.wait_min ?? 0;
  const nextWait = next ? crowd[next.pavilion_id] ?? next.wait_min : 0;
  const nlvl = levelFor(nextWait);
  const [busy, setBusy] = useState(false);
  const once = useRef(false);   // a double tap must not send "left" or navigate twice

  const goNext = async () => {
    if (once.current) return;
    once.current = true;
    setBusy(true);
    await event('left', pid);
    if (next) nav.back('fadeOut');
    else nav.replace('Summary', undefined, 'dissolve');
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar style="dark" />
      <View style={{ position: 'absolute', left: s(121), top: s(72), width: s(160), height: s(160), alignItems: 'center', justifyContent: 'center' }}>
        {[160, 124, 88].map((d, i) => (
          <Animated.View key={d} entering={ZoomIn.delay(i * 90).duration(M.sheet)} style={{ position: 'absolute', width: s(d), height: s(d), borderRadius: s(d / 2), backgroundColor: C.mint, opacity: [0.25, 0.5, 1][i] }} />
        ))}
        <Animated.View entering={ZoomIn.delay(260).duration(M.sheet)} style={{ width: s(56), height: s(56), borderRadius: s(28), backgroundColor: C.deep, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={28} color={C.aqua} />
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.delay(150).duration(M.sheet)} style={{ position: 'absolute', top: s(244), left: s(16), right: s(16), alignItems: 'center', gap: s(6) }}>
        <Txt style={[ar(700, 28, 38), { textAlign: 'center' }]}>خلصت زيارتك؟</Txt>
        <Txt style={[ar(400, 17, 29), { color: C.slate, textAlign: 'center' }]}>{`قضيت ${spent} د في ${nameOf(pid)}، وانتظرت ${waited} د فقط.`}</Txt>
        {savedByReroutes > 0 && (
          <View style={{ backgroundColor: C.mint, borderRadius: s(16), paddingHorizontal: s(12), paddingVertical: s(6), flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
            <Txt style={[ar(600, 13, 19), { color: C.deep }]}>{`وفّرت حتى الآن ${savedByReroutes} د انتظار`}</Txt>
            <Icon name="wait" size={16} color={C.aquaText} />
          </View>
        )}
      </Animated.View>

      {next && (
        <Animated.View entering={FadeInDown.delay(260).duration(M.sheet)} style={{ position: 'absolute', top: s(440), left: s(16), right: s(16), gap: s(12) }}>
          <View style={{ minHeight: s(27), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{`المحطة ${done.length + 2} من ${total}`}</Txt>
            <Txt style={ar(600, 17, 27)}>جاهز للمحطة التالية؟</Txt>
          </View>
          <View style={{ minHeight: s(106), borderRadius: s(22), backgroundColor: C.white, padding: s(12), flexDirection: 'row', alignItems: 'center', gap: s(12), boxShadow: `0px ${s(2)}px ${s(8)}px rgba(8,38,36,0.06), 0px ${s(8)}px ${s(24)}px rgba(8,38,36,0.06)` }}>
            <View style={{ width: s(44), height: s(44), borderRadius: s(22), backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={20} color={C.aquaText} />
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end', gap: s(4) }}>
              <Txt style={ar(600, 17, 27)}>{nameOf(next.pavilion_id)}</Txt>
              <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{`${categoryOf(next.pavilion_id)} · ${next.walk_from_prev_min || walkMinutes(pid, next.pavilion_id)} د مشي`}</Txt>
              <CrowdStatus wait={nextWait} level={nlvl} />
            </View>
            <Image source={photoOf(next.pavilion_id)} style={{ width: s(76), height: s(76), borderRadius: s(16) }} contentFit="cover" />
          </View>
          <View style={{ backgroundColor: C.white, borderWidth: s(1), borderColor: C.line, borderRadius: s(16), padding: s(12), flexDirection: 'row-reverse', alignItems: 'center', gap: s(8) }}>
            <Icon name="crowd" size={18} color={C.aquaText} />
            <Txt style={[ar(400, 15, 24), { color: C.slate, flex: 1 }]}>
              {nlvl === 'low'
                ? `الانتظار في ${nameOf(next.pavilion_id)} عاد منخفضًا كما توقعنا: ${nextWait} د عند وصولك ${fmtTime(next.arrive_at)}.`
                : `الانتظار المتوقع في ${nameOf(next.pavilion_id)}: ${nextWait} د عند وصولك ${fmtTime(next.arrive_at)}.`}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: s(8) }}>
            {[{ t: 'مرافق قريبة', i: 'pin' as const }, { t: 'استراحة طعام قريبة', i: 'food' as const }].map((o) => (
              <Pressy key={o.t}>
                <View style={{ height: s(44), borderRadius: s(22), backgroundColor: C.white, borderWidth: s(1), borderColor: C.line, paddingHorizontal: s(14), flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
                  <Txt style={ar(500, 15, 22)}>{o.t}</Txt>
                  <Icon name={o.i} size={18} color={C.ink} />
                </View>
              </Pressy>
            ))}
          </View>
        </Animated.View>
      )}

      <View style={{ position: 'absolute', left: s(16), right: s(16), bottom: safe.ctaBottom }}>
        <Button label={next ? 'المحطة التالية' : 'إنهاء اليوم'} variant="accent" disabled={busy} onPress={goNext} />
      </View>
    </View>
  );
}

// ---------- Day Summary ----------
function hm(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h} س ${m} د` : `${h} س`) : `${m} د`;
}

export function Summary() {
  const nav = useNav();
  const safe = useSafe();
  const { summary, loadSummary, plan, resetDay } = useStore();
  useEffect(() => { loadSummary().catch(() => {}); }, []);
  const d = plan.start;
  const visited = summary?.visited ?? [];
  const t = summary?.totals;
  const eased = summary?.eased ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: C.deep }}>
      <StatusBar style="light" />
      <View style={{ height: s(382) }}>
        <Image source={PHOTOS.aerial_sunset} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: s(380) }} contentFit="cover" />
        <LinearGradient colors={['rgba(7,60,58,0.2)', C.deep]} style={StyleSheet.absoluteFill} />
      </View>
      <ScrollView style={StyleSheet.absoluteFill} contentContainerStyle={{ paddingTop: s(220), paddingHorizontal: s(16), paddingBottom: s(140), gap: s(16) }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(M.sheet)} style={{ gap: s(4) }}>
          <Txt style={[ar(700, 34, 46), { color: C.white }]}>يوم جميل 👋</Txt>
          <Txt style={[ar(400, 15, 24), { color: C.mint }]}>{`${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]} · إكسبو 2030 الرياض`}</Txt>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(80).duration(M.sheet)} style={{ flexDirection: 'row', gap: s(10), marginTop: s(10) }}>
          <View style={{ flex: 115, minHeight: s(84), borderRadius: s(20), backgroundColor: C.aqua, paddingVertical: s(14), paddingRight: s(10), paddingLeft: s(2), gap: s(2), alignItems: 'flex-end' }}>
            <Txt style={ar(700, 22, 31)} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t ? hm(t.saved_min) : '—'}</Txt>
            <Txt style={[ar(400, 13, 21), { color: C.deep }]}>انتظار وفّرته</Txt>
          </View>
          {[{ v: t ? `${t.distance_km} كم` : '—', l: 'مشي' }, { v: t ? String(t.pavilions) : '—', l: 'أجنحة' }].map((x) => (
            <View key={x.l} style={{ flex: 117, minHeight: s(84), borderRadius: s(20), backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: s(1), borderColor: 'rgba(255,255,255,0.14)', padding: s(14), gap: s(2), alignItems: 'flex-end' }}>
              <Txt style={[ar(700, 22, 31), { color: C.white }]}>{x.v}</Txt>
              <Txt style={[ar(400, 13, 21), { color: C.mint }]}>{x.l}</Txt>
            </View>
          ))}
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(160).duration(M.sheet)} style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: s(1), borderColor: 'rgba(255,255,255,0.12)', borderRadius: s(22), paddingHorizontal: s(16), paddingVertical: s(6) }}>
          {visited.map((v, i) => (
            <View key={v.pavilion_id + i}>
              {i > 0 && <View style={{ height: s(1), backgroundColor: 'rgba(255,255,255,0.1)' }} />}
              <View style={{ height: s(47), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Txt style={[ar(400, 13, 21), { color: C.mint }]}>{fmtTime(v.left_at)}</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
                  <Txt style={[ar(400, 17, 29), { color: C.white }]}>{nameOf(v.pavilion_id)}</Txt>
                  <View style={{ width: s(18), height: s(18), borderRadius: s(10), backgroundColor: C.aqua, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" size={14} color={C.ink} />
                  </View>
                </View>
              </View>
            </View>
          ))}
          {!visited.length && <Txt style={[ar(400, 15, 24), { color: C.mint, paddingVertical: s(12) }]}>لا توجد زيارات مسجّلة بعد.</Txt>}
        </Animated.View>
        {eased.length > 0 && (
          <Animated.View entering={FadeIn.delay(260).duration(M.sheet)} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(10) }}>
            <Icon name="crowd" size={18} color={C.aqua} />
            <Txt style={[ar(400, 13, 21), { color: C.mint, flex: 1 }]}>{`اتبعت اقتراحًا لتعديل مسارك، وساعدت في تخفيف الزحمة عن ${eased.map(nameOf).join(' و')}.`}</Txt>
          </Animated.View>
        )}
      </ScrollView>
      <View style={{ position: 'absolute', left: s(16), right: s(16), bottom: safe.ctaBottom, flexDirection: 'row', gap: s(10) }}>
        <Pressy style={{ flex: 150 }}>
          <Glass level="clear" radius={22} fill="rgba(255,255,255,0.2)" border="rgba(255,255,255,0.4)" style={{ height: s(56), alignItems: 'center', justifyContent: 'center' }}>
            <Txt style={[ar(600, 16, 23), { color: C.white, textAlign: 'center' }]}>مشاركة يومي</Txt>
          </Glass>
        </Pressy>
        <Button label="إنهاء اليوم" variant="accent" style={{ flex: 210 }} onPress={() => { resetDay(); nav.reset('Home', undefined, 'dissolve'); }} />
      </View>
    </View>
  );
}
