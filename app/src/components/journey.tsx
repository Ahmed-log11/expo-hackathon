/**
 * Live-journey components from 03 — Components: Next Stop Card (★ signature), Navigation Instruction,
 * Journey Capsule, Live Alert, Reroute Card, Toast.
 */
import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Image, ImageSource } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { C, M, ar, s, sf } from '../theme';
import { Button, CROWD, CrowdLevel, CrowdPill, FlowDots, Glass, Icon, MetricsRow, Pressy, ShadeTag, Txt } from './ui';

// ---------- Next Stop Card ----------
export function NextStopCard({ compact, stopNo, total, eta, name, category, level, shadePct, walk, wait, visit, cta, onCta, onPress, style }: {
  compact?: boolean; stopNo: number; total: number; eta: string; name: string; category: string; level: CrowdLevel;
  shadePct?: number; walk: number; wait: number; visit: number; cta?: string; onCta?: () => void; onPress?: () => void; style?: ViewStyle;
}) {
  const body = (
    <Glass level="regular" radius={30} fill="rgba(255,255,255,0.84)" border="rgba(255,255,255,0.95)"
      style={{ paddingHorizontal: s(20), paddingTop: s(16), paddingBottom: s(18), gap: s(compact ? 12 : 14) }}>
      <View style={{ minHeight: s(27), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(3) }}>
          <Txt style={[ar(500, 12, 18), { color: C.slate }]}>{`${stopNo} من ${total}`}</Txt>
          <FlowDots total={total} current={stopNo} variant="card" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
          <Txt style={ar(600, 13, 19)}>{`الوصول ${eta}`}</Txt>
          <Txt style={[ar(400, 13, 27), { color: '#617873' }]}>·</Txt>
          <Txt style={[ar(600, 13, 19), { color: C.aquaText }]}>وجهتك التالية</Txt>
          <View style={{ width: s(8), height: s(8), borderRadius: s(4), backgroundColor: C.aqua }} />
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: s(6) }}>
        <Txt style={compact ? ar(700, 22, 31) : ar(700, 28, 38)} numberOfLines={1}>{name}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          {!compact && shadePct != null && shadePct > 0 ? <ShadeTag pct={shadePct} /> : null}
          <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{category}</Txt>
          <CrowdPill level={level} size="medium" label={`${CROWD[level].word} الآن`} />
        </View>
      </View>
      <MetricsRow walk={walk} wait={wait} visit={visit} />
      {!compact && cta ? <Button label={cta} icon="locate" variant="accent" onPress={onCta} /> : null}
    </Glass>
  );
  return onPress ? <Pressy onPress={onPress} style={style} scaleTo={0.99}>{body}</Pressy> : <View style={style}>{body}</View>;
}

// ---------- Navigation Instruction ----------
export function NavInstruction({ title, detail, photo, onPress, style }: { title: string; detail: string; photo?: ImageSource; onPress?: () => void; style?: ViewStyle }) {
  return (
    <Pressy onPress={onPress} style={style} scaleTo={0.99}>
      <Glass level="regular" radius={26} fill="rgba(255,255,255,0.86)" border="rgba(255,255,255,0.95)"
        style={{ padding: s(14), flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: s(12) }}>
        {photo ? <Image source={photo} style={{ width: s(60), height: s(60), borderRadius: s(14) }} contentFit="cover" /> : null}
        <View style={{ flex: 1, alignItems: 'flex-end', gap: s(2) }}>
          <Txt style={ar(600, 17, 27)}>{title}</Txt>
          <Txt style={[ar(400, 15, 24), { color: C.slate }]}>{detail}</Txt>
        </View>
        <View style={{ width: s(52), height: s(52), borderRadius: s(18), backgroundColor: C.deep, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="turn-left" size={26} color={C.aqua} />
        </View>
      </Glass>
    </Pressy>
  );
}

// ---------- Journey Capsule ----------
export function JourneyCapsule({ label, total, current, style }: { label: string; total: number; current: number; style?: ViewStyle }) {
  return (
    <Glass level="regular" radius={22} fill="rgba(255,255,255,0.72)" border="rgba(255,255,255,0.85)"
      style={[{ minHeight: s(44), paddingHorizontal: s(16), flexDirection: 'row', alignItems: 'center', gap: s(10) }, style] as any}>
      <FlowDots total={total} current={current} />
      <Txt style={ar(600, 15, 22)}>{label}</Txt>
    </Glass>
  );
}

// ---------- Live Alert ----------
export function LiveAlert({ kind, text }: { kind: 'rising' | 'searching'; text: string }) {
  const rising = kind === 'rising';
  return (
    <Glass level="regular" radius={22} fill="rgba(255,255,255,0.86)" border="rgba(255,255,255,0.95)"
      style={{ minHeight: s(44), paddingHorizontal: s(14), flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
      <View style={{ width: s(8), height: s(8), borderRadius: s(4), backgroundColor: rising ? C.busy : C.aqua }} />
      <Txt style={ar(600, 15, 22)}>{text}</Txt>
      <Icon name={rising ? 'crowd' : 'reroute'} size={18} color={rising ? C.busyText : C.aquaText} />
    </Glass>
  );
}

// ---------- Toast ----------
export function Toast({ text }: { text: string }) {
  return (
    <View style={{ minHeight: s(44), borderRadius: s(22), backgroundColor: C.deep, paddingHorizontal: s(16), flexDirection: 'row', alignItems: 'center', gap: s(8), boxShadow: `0px ${s(12)}px ${s(40)}px rgba(8,38,36,0.16)` }}>
      <Txt style={[ar(600, 15, 22), { color: C.white }]}>{text}</Txt>
      <View style={{ width: s(20), height: s(20), borderRadius: s(11), backgroundColor: C.aqua, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check" size={14} color={C.ink} />
      </View>
    </View>
  );
}

// ---------- Reroute Card (Compact) ----------
export function RerouteCard({ message, prev, next, oldWait, newWait, oldWaitName, newWaitName, saves, note, confirmed, onAccept, onKeep }: {
  message: string; prev: string; next: string; oldWait: number; newWait: number; oldWaitName: string; newWaitName: string;
  saves: number; note: string; confirmed?: boolean; onAccept: () => void; onKeep: () => void;
}) {
  // "−26 emphasis ring" pulses once when the offer appears.
  const ring = useSharedValue(0);
  React.useEffect(() => { ring.value = withDelay(380, withSequence(withTiming(1, { duration: 260 }), withTiming(0, { duration: 700 }))); }, []);
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value, transform: [{ scale: 1 + 0.02 * ring.value }] }));
  return (
    <View style={{ backgroundColor: C.white, borderRadius: s(30), paddingHorizontal: s(20), paddingTop: s(18), paddingBottom: s(12), gap: s(12), boxShadow: `0px ${s(12)}px ${s(40)}px rgba(8,38,36,0.16)` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(12) }}>
        <View style={{ width: s(42), height: s(42), borderRadius: s(22), backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="reroute" size={22} color={C.aquaText} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: s(2) }}>
          <Txt style={[ar(600, 13, 19), { color: C.aquaText }]}>تحديث على خطتك</Txt>
          <Txt style={ar(700, 22, 31)}>وجدنا لك مسارًا أفضل</Txt>
        </View>
      </View>
      <Txt style={[ar(400, 17, 29), { color: C.slate }]}>{message}</Txt>
      <View style={{ backgroundColor: C.canvas, borderRadius: s(18), paddingHorizontal: s(14), paddingVertical: s(12), gap: s(10) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <View style={{ backgroundColor: C.busyBg, borderRadius: s(10), paddingHorizontal: s(8), justifyContent: 'center' }}>
            <Txt style={[ar(600, 12, 17), { color: C.busyText }]}>{`${oldWaitName} ${oldWait} د`}</Txt>
          </View>
          <Txt style={[ar(400, 15, 24), { color: C.slate2, flex: 1 }]} numberOfLines={1}>{prev}</Txt>
          <Txt style={[ar(600, 13, 19), { color: C.slate2 }]}>السابق</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <View style={{ backgroundColor: C.lowBg, borderRadius: s(10), paddingHorizontal: s(8), justifyContent: 'center' }}>
            <Txt style={[ar(600, 12, 17), { color: C.lowText }]}>{`${newWaitName} ${newWait} د`}</Txt>
          </View>
          <Txt style={[ar(600, 15, 22), { flex: 1 }]} numberOfLines={1}>{next}</Txt>
          <Txt style={[ar(600, 13, 19), { color: C.aquaText }]}>الجديد</Txt>
        </View>
      </View>
      <View>
        <View style={{ minHeight: s(52), borderRadius: s(18), backgroundColor: C.deep, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(8) }}>
          <Txt style={[ar(600, 17, 27), { color: C.white }]}>دقيقة انتظار</Txt>
          <Txt style={[sf(700, 22, 28), { color: C.aqua }]}>{`−${saves}`}</Txt>
          <Icon name="wait" size={22} color={C.aqua} />
        </View>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: s(-4), right: s(-4), top: s(-4), bottom: s(-4), borderRadius: s(22), borderWidth: s(2.5), borderColor: '#20CCB8' }, ringStyle]} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
        <Icon name="crowd" size={18} color={C.slate} />
        <Txt style={[ar(400, 13, 21), { color: C.slate, flex: 1 }]}>{note}</Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: s(8), alignItems: 'stretch' }}>
        <Button label="الإبقاء على خطتي" variant="tertiary" size="medium" height={56} padX={8} style={{ flex: 151 }} onPress={onKeep} />
        <Button label={confirmed ? 'تم تحديث المسار' : 'اعتمد المسار الجديد'} size="medium" height={56} padX={10} style={{ flex: 171 }} onPress={onAccept} />
      </View>
    </View>
  );
}
