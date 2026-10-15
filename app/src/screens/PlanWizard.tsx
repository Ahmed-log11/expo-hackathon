/**
 * 05 — Planning wizard, 3 steps: Time (1/3) → Interests (2/3) → Must Visit (3/3) → Generating.
 * PlanComfort (the old 4th step) is kept but not in the flow; comfort preferences are set on Profile.
 * Every value (positions, sizes, colours, type) comes from the Figma frames on the Prototype page.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { C, M, ar, s, sf, useSafe } from '../theme';
import { Button, Chip, CrowdStatus, Glass, Icon, Pressy, RoundButton, RtlScrollRow, StepProgress, Txt, levelFor } from '../components/ui';
import { useNav } from '../nav/Navigator';
import { AR_DAYS, AR_MONTHS, dayLabel, fmtTime, useStore } from '../data/store';
import { PAVILION_IDS, PLACES, categoryOf, nameOf, namedIn, photoOf, shortName, walkMinutes } from '../data/places';
import { backend } from '../data/api';
import { PHOTOS } from '../assets/images';
import type { IconName } from '../assets/svg';

const layout = LinearTransition.duration(M.standard).easing(M.flowOut);

// ---------- shared frame ----------
const NAV_H = 46;

function WizardFrame({ step, title, subtitle, children, footer, scroll }: {
  step: number; title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode; scroll?: boolean;
}) {
  const nav = useNav();
  const safe = useSafe();
  // The nav bar (step · progress · back) stays put under the status bar; content scrolls beneath it.
  const navTop = safe.top(56);
  const barBottom = navTop + s(NAV_H) + s(6);
  const [footerH, setFooterH] = useState(s(130));
  const header = (
    <View style={{ marginTop: Math.max(s(116), barBottom + s(14)), paddingHorizontal: s(16), gap: s(6) }}>
      <Txt style={ar(700, 34, 46)}>{title}</Txt>
      <Txt style={[ar(400, 17, 29), { color: C.slate }]}>{subtitle}</Txt>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar style="dark" />
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingBottom: footerH + s(16) }} scrollIndicatorInsets={{ top: barBottom, bottom: footerH }} showsVerticalScrollIndicator={false}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {header}
          {children}
        </View>
      )}
      {/* Sticky top bar: canvas behind the status bar and the nav row, then a short fade so scrolled content tucks under it. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
        <View pointerEvents="none" style={{ height: barBottom, backgroundColor: C.canvas }} />
        <LinearGradient pointerEvents="none" colors={[C.canvas, 'rgba(243,248,246,0)']} style={{ height: s(14) }} />
        <View style={{ position: 'absolute', top: navTop, left: s(16), right: s(16), height: s(NAV_H), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt style={[sf(400, 13, 19), { color: C.slate, width: s(44), textAlign: 'left' }]}>{`${step}/3`}</Txt>
          <StepProgress step={step} total={3} />
          <RoundButton icon="chevron-right" onPress={() => nav.back()} />
        </View>
      </View>
      {/* Bottom bar fades the content out behind the button */}
      <LinearGradient
        colors={['rgba(243,248,246,0)', C.canvas]}
        locations={[0, 0.3]}
        pointerEvents="box-none"
        onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: s(16), paddingTop: s(28), paddingBottom: safe.ctaBottom, gap: s(10), alignItems: 'center' }}
      >
        {footer}
      </LinearGradient>
    </View>
  );
}

// ---------- 1/3 Time ----------


function atHour(base: Date, h: number) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() + h * 3600_000);
  return d;
}

export function PlanTime() {
  const nav = useNav();
  const { plan, setPlan } = useStore();
  const startH = plan.start.getHours() + plan.start.getMinutes() / 60;
  const endH = (plan.end.getTime() - atHour(plan.start, 0).getTime()) / 3600_000;
  const hours = Math.max(1, Math.round(endH - startH));
  const day = plan.start;
  const dateLabel = `${dayLabel(day)} · ${AR_DAYS[day.getDay()]} ${day.getDate()} ${AR_MONTHS[day.getMonth()]}`;
  const stops = hours >= 6 ? '4 إلى 6' : hours >= 5 ? '4 إلى 5' : hours >= 4 ? '3 إلى 4' : '2 إلى 3';
  const [note, setNote] = useState<string | null>(null);
  const half = (h: number) => Math.round(h * 2) / 2;
  const setStartH = (raw: number) => {
    setNote(raw < 10 || raw > 23 ? 'إكسبو يفتح من 10:00 ص حتى 12:00 منتصف الليل' : null);
    let h = Math.min(23, Math.max(10, half(raw)));
    let start = atHour(plan.start, h);
    // The plan can't start in the past (the server rejects it): clamp to now.
    const now = new Date();
    if (start.getTime() < now.getTime()) {
      start = now;
      h = now.getHours() + now.getMinutes() / 60;
      setNote('ما يصير تبدأ قبل الوقت الحالي، بدأنا من الحين');
    }
    const end = endH - h < 1 ? atHour(plan.start, Math.min(24, h + 1)) : plan.end;
    setPlan({ start, end });
  };
  const setEndH = (raw: number) => {
    setNote(raw > 24 ? 'إكسبو يقفل الساعة 12:00 منتصف الليل' : raw < startH + 1 ? 'لازم يكون وقت النهاية بعد البداية بساعة على الأقل' : null);
    const h = Math.min(24, Math.max(startH + 1, half(raw)));
    setPlan({ end: atHour(plan.start, h) });
  };

  return (
    <WizardFrame
      step={1}
      scroll
      title="خطط يومك"
      subtitle="حدد وقتك داخل إكسبو، ونرتّب لك المحطات حسب الزحمة المتوقعة."
      footer={<Button label="التالي" style={{ alignSelf: 'stretch' }} onPress={() => nav.push('PlanInterests')} />}
    >
      <View style={{ marginTop: s(24), paddingHorizontal: s(16), gap: s(12), alignItems: 'flex-end' }}>
        <View style={{ height: s(44), borderRadius: s(18), backgroundColor: C.white, borderWidth: s(1), borderColor: C.line, paddingHorizontal: s(14), flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <Txt style={ar(600, 15, 22)}>{dateLabel}</Txt>
          <Icon name="calendar" size={20} color={C.aquaText} />
        </View>
        <TimeSelector question="متى تبدأ زيارتك؟" value={hhmm(startH)} hour={startH} onSet={setStartH} isEnd={false} />
          {note && <Txt style={[ar(500, 13, 19), { color: '#B4532A', alignSelf: 'stretch' }]}>{note}</Txt>}
        <TimeSelector question="متى تريد إنهاء يومك؟" value={hhmm(endH)} hour={endH} onSet={setEndH} isEnd />
        <View style={{ alignSelf: 'stretch', backgroundColor: C.deep, borderRadius: s(26), padding: s(20), gap: s(12) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(8) }}>
            <View style={{ width: s(44), height: s(44), borderRadius: s(20), backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="clock" size={24} color={C.aqua} />
            </View>
            <View style={{ alignItems: 'flex-end', gap: s(2) }}>
              <Animated.View key={hours} entering={FadeIn.duration(M.standard)}>
                <Txt style={[ar(700, 28, 38), { color: C.white }]}>{`${hours} ساعات متاحة`}</Txt>
              </Animated.View>
              <Txt style={[ar(400, 15, 24), { color: 'rgba(207,245,237,0.72)' }]}>{`من ${fmtTime(plan.start)} حتى ${fmtTime(plan.end)}`}</Txt>
            </View>
          </View>
          <DayTrack hours={hours} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt style={[ar(400, 12, 18), { color: 'rgba(255,255,255,0.56)' }]}>{fmtTime(plan.end)}</Txt>
            <Txt style={[ar(400, 12, 18), { color: 'rgba(255,255,255,0.56)' }]}>{fmtTime(plan.start)}</Txt>
          </View>
          <Txt style={[ar(400, 13, 21), { color: 'rgba(255,255,255,0.66)' }]}>{`مناسب لـ ${stops} محطات مع وقت للطعام والراحة.`}</Txt>
        </View>
      </View>
    </WizardFrame>
  );
}

function parseTime(text: string, isEnd: boolean): number | null {
  const m = text.trim().match(/^(\d{1,2})(?:[:.](\d{1,2}))?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (isEnd && h === 0) h = 24;   // 00:00 في النهاية = منتصف الليل
  return h + min / 60;
}

const hhmm = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;function TimeSelector({ question, value, hour, onSet, isEnd }: {
  question: string; value: string; hour: number; onSet: (h: number) => void; isEnd: boolean;
}) {
  const [text, setText] = useState<string | null>(null);   // null = not editing
  const done = () => {
    if (text != null) { const h = parseTime(text, isEnd); if (h != null) onSet(h); }
    setText(null);
  };
  return (
    <View style={{ alignSelf: 'stretch', height: s(75), borderRadius: s(22), backgroundColor: C.white, padding: s(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
        <StepBtn label="-" onPress={() => onSet(hour - 0.5)} />
        <TextInput
          value={text ?? value}
          onFocus={() => setText('')}
          onChangeText={setText}
          onEndEditing={done}
          onSubmitEditing={done}
          placeholder="16:30"
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          style={{ fontFamily: ar(600, 17).fontFamily, fontSize: s(17), height: s(40), paddingVertical: 0, minWidth: s(72), textAlign: 'center', color: C.ink, backgroundColor: '#E8F0ED', borderRadius: s(12), paddingHorizontal: s(8) }}
        />
        <StepBtn label="+" onPress={() => onSet(hour + 0.5)} />
      </View>
      <Txt style={ar(600, 17, 27)}>{question}</Txt>
    </View>
  );
}

function StepBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressy onPress={onPress}>
      <View style={{ width: s(36), height: s(36), borderRadius: s(18), backgroundColor: '#E8F0ED', alignItems: 'center', justifyContent: 'center' }}>
        <Txt style={[sf(600, 20, 24), { textAlign: 'center', color: C.deep }]}>{label}</Txt>
      </View>
    </Pressy>
  );
}

/** Day track: available time fills from the start (right) toward the end (left), with suggested stops. */
function DayTrack({ hours }: { hours: number }) {
  const W = 330;
  const fill = Math.min(1, hours / 6) * W;
  const fillStyle = useAnimatedStyle(() => ({ width: withTiming(s(fill), { duration: M.standard, easing: M.flowOut }) }), [fill]);
  const dots = [36, 116, 196, 276, 356].map((x) => x - 36);
  return (
    <View style={{ height: s(10), justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: 0, right: 0, height: s(4), borderRadius: s(2), backgroundColor: 'rgba(255,255,255,0.18)' }} />
      <Animated.View style={[{ position: 'absolute', right: 0, height: s(4), borderRadius: s(2), backgroundColor: C.aqua }, fillStyle]} />
      {dots.map((x, i) => (
        <View key={i} style={{
          position: 'absolute', left: s(x), width: s(10), height: s(10), borderRadius: s(5),
          backgroundColor: i === 4 ? C.aqua : C.white, opacity: W - x > fill + 6 ? 0.25 : 1,
        }} />
      ))}
    </View>
  );
}

// ---------- 2/3 Interests ----------
const INTERESTS: { key: string; label: string; icon: IconName; photo: keyof typeof PHOTOS; iconColor?: string }[] = [
  { key: 'technology', label: 'التقنية', icon: 'tech', photo: 'hero' },
  { key: 'culture', label: 'الثقافة', icon: 'culture', photo: 'culture' },
  { key: 'planet', label: 'الاستدامة', icon: 'leaf', photo: 'sustainability' },
  { key: 'humanity', label: 'الإنسانية', icon: 'family', photo: 'interactive' },
  { key: 'collaboration', label: 'التعاون', icon: 'globe', photo: 'aerial_sunset' },
];

export function PlanInterests() {
  const nav = useNav();
  const { plan, setPlan } = useStore();
  const toggle = (k: string) => setPlan({ tags: plan.tags.includes(k) ? plan.tags.filter((t) => t !== k) : [...plan.tags, k] });
  const rows = [INTERESTS.slice(0, 2), INTERESTS.slice(2, 4), INTERESTS.slice(4, 6)];
  const n = plan.tags.length;
  return (
    <WizardFrame
      step={2}
      scroll
      title="وش تحب تكتشف؟"
      subtitle="اكتب ما تحب أو اختر اهتماماتك، ونرتّب يومك حولها."
      footer={<Button label="التالي" disabled={n === 0 && !plan.text.trim()} style={{ alignSelf: 'stretch' }} onPress={() => nav.push('PlanMustVisit')} />}
    >
      <View style={{ marginTop: s(20), paddingHorizontal: s(16), gap: s(16) }}>
        {/* Their own words: read by the AI, which picks pavilions that match. First on the page. */}
        <View style={{ gap: s(8) }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(6) }}>
            <Icon name="plan" size={18} color={C.aquaText} />
            <Txt style={[ar(600, 15, 22), { color: C.ink }]}>اكتب ما تحب بكلماتك</Txt>
          </View>
          <TextInput
            value={plan.text}
            onChangeText={(t) => setPlan({ text: t })}
            placeholder="مثلًا: أحب الفضاء والأكل الياباني، ومعي أطفال"
            placeholderTextColor={C.muted}
            multiline
            maxLength={300}
            style={{ fontFamily: ar(400, 16).fontFamily, fontSize: s(16), minHeight: s(72), textAlign: 'right', writingDirection: 'rtl', color: C.ink, backgroundColor: C.white, borderRadius: s(18), borderWidth: s(1), borderColor: C.line, paddingHorizontal: s(14), paddingVertical: s(10) }}
          />
        </View>
        {/* ...or pick from the interest cards */}
        <Txt style={[ar(600, 15, 22), { color: C.ink, textAlign: 'right', marginTop: s(4) }]}>أو اختر من الاهتمامات</Txt>
        {/* Selection count sits right above the cards it counts. */}
        <View style={{ minHeight: s(27), flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: s(6), marginTop: s(-8), marginBottom: s(-4) }}>
          <Txt style={[ar(600, 13, 19), { color: n === 0 ? C.slate : C.aquaText }]}>{n === 0 ? 'اختر اهتمامًا أو اكتب ما تحب' : n === 1 ? 'اهتمام واحد مختار' : n === 2 ? 'اهتمامان مختاران' : `${n} اهتمامات مختارة`}</Txt>
          {n > 0 && <View style={{ width: s(18), height: s(18), borderRadius: s(9), backgroundColor: C.aqua, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={12} color={C.ink} /></View>}
        </View>
        {rows.map((row, i) => (
          // Row order in Figma is left → right; the first interest sits on the right (RTL).
          <View key={i} style={{ flexDirection: 'row-reverse', gap: s(16) }}>
            {row.map((it) => <InterestCard key={it.key} item={it} selected={plan.tags.includes(it.key)} onPress={() => toggle(it.key)} />)}
          </View>
        ))}
      </View>
    </WizardFrame>
  );
}

function InterestCard({ item, selected, onPress }: { item: typeof INTERESTS[number]; selected: boolean; onPress: () => void }) {
  return (
    <Pressy onPress={onPress} style={{ width: s(177), height: s(150) }}>
      <View style={{ flex: 1, borderRadius: s(24), overflow: 'hidden' }}>
        <Image source={PHOTOS[item.photo]} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={['rgba(8,38,36,0)', 'rgba(8,38,36,0.72)']} style={StyleSheet.absoluteFill} />
        <View style={{ position: 'absolute', right: s(14), bottom: s(14), flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <Glass level="clear" radius={14} style={{ width: s(32), height: s(32), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={item.icon} size={18} color={item.iconColor ?? C.white} />
          </Glass>
          <Txt style={[ar(600, 17, 27), { color: C.white }]}>{item.label}</Txt>
        </View>
        {selected && (
          <Animated.View entering={FadeIn.duration(M.standard)} exiting={FadeOut.duration(M.fast)} style={[StyleSheet.absoluteFill, { borderRadius: s(24), borderWidth: s(3), borderColor: C.aqua }]} pointerEvents="none">
            <View style={{ position: 'absolute', left: s(9), top: s(9), width: s(28), height: s(28), borderRadius: s(15), backgroundColor: C.aqua, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={18} color={C.ink} />
            </View>
          </Animated.View>
        )}
      </View>
    </Pressy>
  );
}

// ---------- 3/3 Must Visit ----------
const FILTERS = [
  { key: 'mine', label: 'حسب اهتماماتك' },
  { key: 'all', label: 'الكل' },
  { key: 'intl', label: 'الأجنحة الدولية' },
  { key: 'technology', label: 'التقنية' },
  { key: 'culture', label: 'الثقافة' },
  { key: 'planet', label: 'الاستدامة' },
  { key: 'humanity', label: 'الإنسانية' },
  { key: 'collaboration', label: 'التعاون' },
];
const TAG_FOR_INTEREST: Record<string, string[]> = {
  technology: ['technology'], culture: ['culture'], planet: ['planet'], humanity: ['humanity'], collaboration: ['collaboration'],
};
const PRESELECT = 6;
const AI_PRESELECT = 4;   // how many of the AI's suggestions start ticked (named pavilions always are)
/** The interests we last pre-selected pavilions for; going back and forth keeps the visitor's edits. */
let preselectedFor = '';

export function PlanMustVisit() {
  const nav = useNav();
  const { plan, setPlan, crowd } = useStore();
  const [filter, setFilter] = useState('mine');
  const [seeded, setSeeded] = useState(0);
  const wanted = useMemo(() => new Set(plan.tags.flatMap((t) => TAG_FOR_INTEREST[t] ?? [])), [plan.tags]);
  // Their own words: pavilions named outright count as chosen right away; the AI's wider reading
  // (POST /wishlist) arrives a moment later and is offered as choices too.
  const text = plan.text.trim();
  const named = useMemo(() => namedIn(plan.text), [plan.text]);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    if (!text || plan.aiFor === text) return;
    let live = true;
    setReading(true);
    backend.previewWishlist(text, 'ar')
      .then((r) => live && setPlan({ aiIds: r.items.map((i) => i.pavilion_id).filter((id) => PLACES[id]), aiFor: text }))
      .catch(() => live && setPlan({ aiIds: [], aiFor: text }))   // offline: the named ones still count
      .finally(() => live && setReading(false));
    return () => { live = false; };
  }, [text]);
  const ai = useMemo(() => (text && plan.aiFor === text ? plan.aiIds.filter((id) => !named.includes(id)) : []),
    [text, plan.aiFor, plan.aiIds, named]);
  const fromWords = [...named, ...ai];
  const matches = (id: string) => (PLACES[id].tags ?? []).some((t) => wanted.has(t)) || fromWords.includes(id);
  // New interests or words: start with what their words asked for, then the most popular matching ones, already picked.
  useEffect(() => {
    const key = `${plan.tags.join(',')}|${fromWords.join(',')}`;
    if (key === preselectedFor) return;
    preselectedFor = key;
    const top = PAVILION_IDS.filter((id) => matches(id) && !fromWords.includes(id))
      .sort((a, b) => (PLACES[b].popularity ?? 0) - (PLACES[a].popularity ?? 0));
    // Named pavilions are always ticked; of the AI's other suggestions, only the best few
    // (a day fits ~3-5 stops). The rest stay listed, unticked, ready to add.
    const aiTicked = ai.slice(0, Math.max(0, AI_PRESELECT - named.length));
    const ticked = [...named, ...aiTicked];
    setPlan({ mustVisit: [...ticked, ...top].slice(0, Math.min(8, Math.max(PRESELECT, ticked.length))) });
    setSeeded((n) => n + 1);
  }, [plan.tags, fromWords.join(',')]);
  const list = useMemo(() => {
    const score = (id: string) => {
      const p = PLACES[id];
      const match = (p.tags ?? []).filter((t) => wanted.has(t)).length;
      const pick = plan.mustVisit.indexOf(id);
      return (pick >= 0 ? 1000 - pick * 10 : 0) + match * 10 + (p.popularity ?? 0);   // picks first, in the order chosen
    };
    return PAVILION_IDS
      .filter((id) => {
        if (filter === 'all') return true;
        if (filter === 'mine') return matches(id) || plan.mustVisit.includes(id);   // picks added from "الكل" stay visible
        if (filter === 'intl') return PLACES[id].district !== 'central' && !id.startsWith('th_');
        return (PLACES[id].tags ?? []).includes(filter);
      })
      .sort((a, b) => score(b) - score(a));
    // The order is set when the list opens, the filter changes or picks are pre-selected, so cards don't jump while you tap them.
  }, [filter, wanted, seeded]);
  const toggle = (id: string) => setPlan({ mustVisit: plan.mustVisit.includes(id) ? plan.mustVisit.filter((x) => x !== id) : [...plan.mustVisit, id].slice(0, 8) });

  return (
    <WizardFrame
      step={3}
      scroll
      title="أماكن ما تبغى تفوتها"
      subtitle="اختر الأجنحة اللي تهمك، ونضمنها في خطتك."
      footer={<Button label="أنشئ خطتي" style={{ alignSelf: 'stretch' }} onPress={() => nav.push('Generating', undefined, 'dissolve')} />}
    >
      <View style={{ marginTop: s(20), gap: s(12) }}>
        <View style={{ marginHorizontal: s(16), height: s(50), borderRadius: s(25), backgroundColor: '#E8F0ED', paddingHorizontal: s(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: s(10) }}>
          <Txt style={[ar(400, 17, 29), { color: C.slate, flex: 1 }]}>ابحث عن جناح أو تجربة</Txt>
          <Icon name="search" size={22} color={C.slate} />
        </View>
        {/* First chip sits on the right; the row scrolls toward the left (RTL). */}
        <RtlScrollRow>
          {FILTERS.map((f) => <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />)}
        </RtlScrollRow>
        {/* What the AI read in their own words (step 2's text box) */}
        {!!text && (
          <View style={{ marginHorizontal: s(16), flexDirection: 'row-reverse', alignItems: 'center', gap: s(10), backgroundColor: C.mintSoft, borderRadius: s(18), borderWidth: s(1), borderColor: 'rgba(32,205,184,0.35)', paddingHorizontal: s(14), paddingVertical: s(10) }}>
            {reading ? <ActivityIndicator color={C.aquaText} /> : <Icon name="plan" size={20} color={C.aquaText} />}
            <View style={{ flex: 1, alignItems: 'flex-end', gap: s(2) }}>
              <Txt style={[ar(700, 14, 21), { color: C.aquaText }]}>
                {reading ? 'نقرأ كلامك…'
                  : fromWords.length ? `اقترحنا ${fromWords.length} من كلامك${fromWords.length > AI_PRESELECT ? `، واخترنا لك أفضل ${Math.max(AI_PRESELECT, named.length)}` : ''}`
                  : 'ما لقينا أجنحة تطابق كلامك'}
              </Txt>
              {!reading && (
                <Txt style={[ar(400, 13, 20), { color: C.ink }]} numberOfLines={2}>
                  {fromWords.length ? `${fromWords.slice(0, 4).map(shortName).join('، ')}${fromWords.length > 4 ? '…' : ''} — اختر أو أزل ما تريد` : 'اختر من القائمة بالأسفل'}
                </Txt>
              )}
            </View>
          </View>
        )}
        <View style={{ marginHorizontal: s(16), minHeight: s(27), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt style={[ar(600, 13, 19), { color: C.aquaText }]}>{`${plan.mustVisit.length} مختارة`}</Txt>
          <Txt style={ar(600, 17, 27)}>اقتراحات حسب اهتماماتك</Txt>
        </View>
        {list.map((id) => (
          <Animated.View key={id} layout={layout} style={{ marginHorizontal: s(16) }}>
            <PavilionPick id={id} selected={plan.mustVisit.includes(id)} wait={crowd[id]} onPress={() => toggle(id)} />
          </Animated.View>
        ))}
      </View>
    </WizardFrame>
  );
}

function PavilionPick({ id, selected, wait, onPress }: { id: string; selected: boolean; wait?: number; onPress: () => void }) {
  const lvl = wait != null ? levelFor(wait) : 'low';
  return (
    <Pressy onPress={onPress}>
      <View style={{
        minHeight: s(106), borderRadius: s(22), backgroundColor: selected ? '#F6FCFA' : C.white, padding: s(12),
        flexDirection: 'row', alignItems: 'center', gap: s(12),
        // Selected: the filled Aqua check carries the state; a thin tinted border and a faint tint support it.
        borderWidth: s(1), borderColor: selected ? 'rgba(32,205,184,0.5)' : 'transparent',
        boxShadow: `0px ${s(2)}px ${s(8)}px rgba(8,38,36,0.06), 0px ${s(8)}px ${s(24)}px rgba(8,38,36,0.06)`,
      }}>
        <View style={{ width: s(44), height: s(44), borderRadius: s(22), backgroundColor: selected ? C.aqua : C.mint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={selected ? 'check' : 'plus'} size={20} color={selected ? C.ink : C.aquaText} />
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end', gap: s(4) }}>
          <Txt style={ar(600, 17, 27)}>{nameOf(id)}</Txt>
          <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{`${categoryOf(id)} · ${walkMinutes('icon', id)} د مشي`}</Txt>
          {wait != null && <CrowdStatus wait={wait} level={lvl} />}
        </View>
        <Image source={photoOf(id)} style={{ width: s(76), height: s(76), borderRadius: s(16) }} contentFit="cover" />
      </View>
    </Pressy>
  );
}

// ---------- Comfort (not in the 3-step flow) ----------
// Listed left → right per row, as in Figma.
const COMFORT: { key: string; title: string; desc: string; icon: IconName }[] = [
  { key: 'shade', title: 'مسارات مظللة', desc: 'نفضّل الممرات المظللة وقت الحر', icon: 'shade' },
  { key: 'less_walk', title: 'أقل مشي', desc: 'محطات متقاربة ومسافات أقصر', icon: 'walk' },
  { key: 'family', title: 'مناسب للعائلة', desc: 'استراحات ومرافق للأطفال', icon: 'family' },
  { key: 'less_wait', title: 'أقل انتظار', desc: 'نرتّب المحطات حسب أقصر طوابير', icon: 'wait' },
  { key: 'balanced', title: 'مزيج متوازن', desc: 'توازن بين المشي والانتظار', icon: 'balance' },
  { key: 'access', title: 'سهولة الوصول', desc: 'مسارات بلا درج ومصاعد قريبة', icon: 'access' },
];

export function PlanComfort() {
  const nav = useNav();
  const { plan, setPlan } = useStore();
  const toggle = (k: string) => setPlan({ comfort: plan.comfort.includes(k) ? plan.comfort.filter((t) => t !== k) : [...plan.comfort, k] });
  const rows = [COMFORT.slice(0, 2), COMFORT.slice(2, 4), COMFORT.slice(4, 6)];
  return (
    <WizardFrame
      step={4}
      title="كيف تحب يكون يومك؟"
      subtitle="نوازن بين المشي والانتظار والراحة حسب ما يناسبك."
      footer={<>
        <Txt style={[ar(400, 13, 21), { color: C.slate, textAlign: 'center' }]}>يمكنك تعديل تفضيلاتك لاحقًا من حسابي</Txt>
        <Button label="أنشئ خطتي" style={{ alignSelf: 'stretch' }} onPress={() => nav.push('Generating', undefined, 'dissolve')} />
      </>}
    >
      <View style={{ marginTop: s(20), paddingHorizontal: s(16), gap: s(16) }}>
        {rows.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: s(16), alignItems: 'flex-start' }}>
            {row.map((it) => <ComfortCard key={it.key} item={it} selected={plan.comfort.includes(it.key)} onPress={() => toggle(it.key)} />)}
          </View>
        ))}
      </View>
    </WizardFrame>
  );
}

function ComfortCard({ item, selected, onPress }: { item: typeof COMFORT[number]; selected: boolean; onPress: () => void }) {
  return (
    <Pressy onPress={onPress} style={{ width: s(177) }}>
      <Animated.View layout={layout} style={{
        minHeight: s(157), borderRadius: s(22), padding: s(16), gap: s(10), alignItems: 'flex-end',
        backgroundColor: selected ? C.mint : C.white, borderWidth: s(selected ? 2 : 1), borderColor: selected ? C.aqua : C.line,
      }}>
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: s(38) }}>
          {selected ? (
            <Animated.View entering={FadeIn.duration(M.standard)} style={{ width: s(22), height: s(22), borderRadius: s(12), backgroundColor: C.aqua, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={16} color={C.ink} />
            </Animated.View>
          ) : <View />}
          <View style={{ width: s(38), height: s(38), borderRadius: s(14), backgroundColor: selected ? C.white : '#E8F0ED', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={item.icon} size={22} color={selected ? C.aquaText : C.ink} />
          </View>
        </View>
        <Txt style={[ar(600, 17, 27), { color: selected ? C.deep : C.ink }]}>{item.title}</Txt>
        <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{item.desc}</Txt>
      </Animated.View>
    </Pressy>
  );
}
