/**
 * INSYAB component kit, built from 03 — Components in Figma.
 * Horizontal rows keep Figma's child order left → right, so RTL designs come out exactly as drawn.
 */
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { SvgXml } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { C, M, T, ar, s, scaleShadow, sf } from '../theme';
import { ICON_SVGS, IconName } from '../assets/svg';

// ---------- text ----------
export function Txt({ style, ...rest }: TextProps & { style?: StyleProp<TextStyle> }) {
  return <Text allowFontScaling={false} {...rest} style={[{ color: C.ink, textAlign: 'right' }, style]} />;
}

// ---------- icon ----------
export function Icon({ name, size = 24, color = C.ink, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: s(size), height: s(size) }, style]} pointerEvents="none">
      <SvgXml xml={ICON_SVGS[name]} width={s(size)} height={s(size)} color={color} />
    </View>
  );
}

// ---------- press feedback: content compresses ~2% in 160 ms (Motion · Button press) ----------
export function Pressy({ onPress, children, style, disabled, scaleTo = 0.98, haptic = true, hitSlop }: {
  onPress?: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle>; disabled?: boolean;
  scaleTo?: number; haptic?: boolean; hitSlop?: number;
}) {
  const k = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));
  // Layout styles (position, size, flex) go on the touch area; the content inside scales on press.
  return (
    <Pressable
      disabled={disabled}
      hitSlop={hitSlop}
      style={style}
      onPressIn={() => { k.value = withTiming(scaleTo, { duration: M.fast }); }}
      onPressOut={() => { k.value = withTiming(1, { duration: M.fast }); }}
      onPress={() => { if (haptic) Haptics.selectionAsync().catch(() => {}); onPress?.(); }}
    >
      <Animated.View style={[{ flexGrow: 1 }, a]}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------- glass (Surface/Glass/Clear · Regular) ----------
const GLASS = {
  clear: {
    intensity: 38, fill: 'rgba(255,255,255,0.22)', border: 'rgba(255,255,255,0.42)',
    drop: scaleShadow('0px 4px 16px rgba(8,38,36,0.10)'), inset: scaleShadow('inset 0px 1px 0px rgba(255,255,255,0.55)'),
  },
  regular: {
    intensity: 60, fill: 'rgba(255,255,255,0.62)', border: 'rgba(255,255,255,0.75)',
    drop: scaleShadow('0px 8px 32px rgba(8,38,36,0.12)'), inset: scaleShadow('inset 0px 1px 0px rgba(255,255,255,0.70)'),
  },
};
export function Glass({ level = 'regular', radius, fill, border, borderWidth = 1, style, children, pointerEvents }: {
  level?: 'clear' | 'regular'; radius: number; fill?: string; border?: string; borderWidth?: number;
  style?: StyleProp<ViewStyle>; children?: React.ReactNode; pointerEvents?: 'auto' | 'none' | 'box-none';
}) {
  const g = GLASS[level];
  const r = s(radius);
  return (
    <View style={[{ borderRadius: r, boxShadow: g.drop }, style]} pointerEvents={pointerEvents}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: 'hidden' }]} pointerEvents="none">
        <BlurView intensity={g.intensity} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill ?? g.fill }]} />
      </View>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, {
          borderRadius: r, borderWidth: s(borderWidth), borderColor: border ?? g.border,
          boxShadow: g.inset,
        }]}
      />
      {children}
    </View>
  );
}

// ---------- buttons (Button: Primary / Accent / Secondary / Tertiary / On Image × Large / Medium) ----------
type BtnVariant = 'primary' | 'accent' | 'secondary' | 'tertiary' | 'onImage';
const BTN: Record<BtnVariant, { bg: string; fg: string; pressed?: string }> = {
  primary: { bg: C.deep, fg: C.white, pressed: C.deepPressed },
  accent: { bg: C.aqua, fg: C.ink, pressed: '#1DBBA7' },
  secondary: { bg: C.mint, fg: C.deep },
  tertiary: { bg: 'transparent', fg: C.aquaText },
  onImage: { bg: 'rgba(255,255,255,0.2)', fg: C.white },
};
export function Button({ label, icon, variant = 'primary', size = 'large', onPress, style, disabled, width, textColor, height, padX }: {
  label: string; icon?: IconName; variant?: BtnVariant; size?: 'large' | 'medium';
  onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean; width?: number; textColor?: string; height?: number; padX?: number;
}) {
  const v = { ...BTN[variant], ...(textColor ? { fg: textColor } : {}) };
  const large = size === 'large';
  const [down, setDown] = React.useState(false);
  const k = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));
  const inner = (
    <>
      <Txt numberOfLines={1} style={[large ? ar(600, 17, 27) : ar(600, 16, 23), { color: v.fg, textAlign: 'center', flexShrink: 1 }]}>{label}</Txt>
      {icon ? <Icon name={icon} size={large ? 22 : 20} color={v.fg} /> : null}
    </>
  );
  const box: ViewStyle = {
    minHeight: s(height ?? (large ? 56 : 44)), borderRadius: s(large ? 28 : 22), paddingHorizontal: s(padX ?? (large ? 24 : 18)),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(8),
    backgroundColor: down && v.pressed ? v.pressed : v.bg, opacity: disabled ? 0.38 : 1,
    width: width != null ? s(width) : undefined,
  };
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => { setDown(true); k.value = withTiming(0.98, { duration: M.fast }); }}
      onPressOut={() => { setDown(false); k.value = withTiming(1, { duration: M.fast }); }}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onPress?.(); }}
      style={style}
    >
      {variant === 'onImage' ? (
        <Animated.View style={a}>
          <Glass level="clear" radius={large ? 28 : 22} fill="rgba(255,255,255,0.2)" border="rgba(255,255,255,0.4)" style={box}>{inner}</Glass>
        </Animated.View>
      ) : (
        <Animated.View style={[box, a]}>{inner}</Animated.View>
      )}
    </Pressable>
  );
}

// ---------- glass round button (Glass Button: Clear / Regular × Default / Selected) ----------
export function GlassButton({ icon, level = 'regular', selected, onPress, size = 48, iconSize = 22, style }: {
  icon: IconName; level?: 'clear' | 'regular'; selected?: boolean; onPress?: () => void; size?: number; iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressy onPress={onPress} style={style} scaleTo={0.94}>
      <Glass
        level={level}
        radius={size / 2}
        fill={selected ? 'rgba(7,60,58,0.88)' : undefined}
        border={selected ? C.aqua : undefined}
        borderWidth={selected ? 1.5 : 1}
        style={{ width: s(size), height: s(size), alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name={icon} size={iconSize} color={selected ? C.aqua : C.ink} />
      </Glass>
    </Pressy>
  );
}

/** Solid white round button with a hairline (wizard "Back"). */
export function RoundButton({ icon, onPress, size = 46, style }: { icon: IconName; onPress?: () => void; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressy onPress={onPress} style={style} scaleTo={0.94}>
      <View style={{
        width: s(size), height: s(size), borderRadius: s(size / 2), backgroundColor: C.white,
        borderWidth: s(1), borderColor: C.line, alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={24} color={C.ink} />
      </View>
    </Pressy>
  );
}

// ---------- chip ----------
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressy onPress={onPress}>
      <View style={{
        minHeight: s(44), borderRadius: s(22), paddingHorizontal: s(16), flexDirection: 'row', alignItems: 'center', gap: s(6),
        backgroundColor: selected ? C.mint : C.white, borderWidth: s(selected ? 1.5 : 1), borderColor: selected ? C.aqua : C.line,
      }}>
        <Txt style={[selected ? ar(600, 15, 22) : ar(500, 15, 22), { color: selected ? C.deep : C.ink }]}>{label}</Txt>
        {selected ? <Icon name="check" size={18} color={C.deep} /> : null}
      </View>
    </Pressy>
  );
}

// ---------- crowd status ----------
export type CrowdLevel = 'low' | 'moderate' | 'busy' | 'critical';
export const CROWD = {
  low: { bg: C.lowBg, fg: C.lowText, dot: C.low, word: 'منخفض' },
  moderate: { bg: C.modBg, fg: C.modText, dot: C.mod, word: 'متوسط' },
  busy: { bg: C.busyBg, fg: C.busyText, dot: C.busy, word: 'مزدحم' },
  critical: { bg: '#FBE1E1', fg: '#B23535', dot: C.critical, word: 'مزدحم جدًا' },
};
/** Crowd level from a wait in minutes, as the design labels it (19–24 متوسط, 34–38 مزدحم, 55 مزدحم جدًا). */
export function levelFor(wait: number): CrowdLevel {
  if (wait < 15) return 'low';
  if (wait < 30) return 'moderate';
  if (wait < 50) return 'busy';
  return 'critical';
}
export function CrowdPill({ level, label, size = 'small', style }: { level: CrowdLevel; label: string; size?: 'small' | 'medium'; style?: StyleProp<ViewStyle> }) {
  const c = CROWD[level];
  const small = size === 'small';
  return (
    <View style={[{
      minHeight: s(small ? 26 : 32), borderRadius: s(small ? 13 : 16), paddingLeft: s(small ? 8 : 10), paddingRight: s(small ? 10 : 12),
      flexDirection: 'row', alignItems: 'center', gap: s(6), backgroundColor: c.bg, alignSelf: 'flex-end',
    }, style]}>
      <Txt style={[small ? ar(600, 13, 19) : ar(600, 15, 22), { color: c.fg }]}>{label}</Txt>
      <View style={{ width: s(small ? 7 : 8), height: s(small ? 7 : 8), borderRadius: s(4), backgroundColor: c.dot }} />
    </View>
  );
}

// ---------- wizard step progress (Nav Bar · Progress) ----------
/** Four bars; Figma draws them right → left: done = Deep, current = Aqua (28 wide), upcoming = track. */
export function StepProgress({ step, total = 4 }: { step: number; total?: number }) {
  const bars = [];
  for (let i = total; i >= 1; i--) {
    const current = i === step;
    bars.push(
      <View key={i} style={{
        width: s(current ? 28 : 16), height: s(4), borderRadius: s(2),
        backgroundColor: current ? C.aqua : i < step ? C.deep : C.track,
      }} />,
    );
  }
  return <View style={{ flexDirection: 'row', gap: s(4) }}>{bars}</View>;
}

// ---------- small dot progress used by Journey Capsule / Next Stop header ----------
export function FlowDots({ total, current, variant = 'capsule' }: { total: number; current: number; variant?: 'capsule' | 'card' }) {
  // Figma draws upcoming stops on the left and completed ones on the right (RTL timeline).
  const out = [];
  for (let i = total; i >= 1; i--) {
    if (variant === 'card') {
      const isCur = i === current;
      const done = i < current;
      out.push(<View key={`d${i}`} style={{ width: s(isCur ? 10 : 6), height: s(isCur ? 10 : 6), borderRadius: s(5), backgroundColor: isCur ? C.aqua : done ? C.deep : C.muted }} />);
      if (i > 1) out.push(<View key={`l${i}`} style={{ width: s(10), height: s(2), borderRadius: s(1), backgroundColor: i - 1 < current ? C.deep : C.line }} />);
    } else {
      const isCur = i === current;
      out.push(<View key={i} style={{ width: s(isCur ? 9 : 6), height: s(isCur ? 9 : 6), borderRadius: s(5), backgroundColor: isCur ? C.aqua : i < current ? C.deep : 'rgba(96,120,116,0.5)' }} />);
    }
  }
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(variant === 'card' ? 2 : 4) }}>{out}</View>;
}

// ---------- shade tag ----------
export function ShadeTag({ pct }: { pct: number }) {
  return (
    <View style={{ minHeight: s(25), borderRadius: s(10), backgroundColor: C.mint, paddingHorizontal: s(8), flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
      <Txt style={[ar(500, 13, 19), { color: C.aquaText }]}>{`مظلل ${pct}%`}</Txt>
      <Icon name="shade" size={14} color={C.aquaText} />
    </View>
  );
}

// ---------- metrics (Next Stop Card · Metrics) ----------
export function Metric({ value, unit = 'د', label, icon }: { value: number | string; unit?: string; label: string; icon: IconName }) {
  return (
    <View style={{ flex: 1, alignItems: 'flex-end', gap: s(2) }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: s(4) }}>
        <Txt style={[ar(600, 15, 22), { color: C.slate }]}>{unit}</Txt>
        <Txt style={[sf(700, 28, 32), { letterSpacing: s(-0.4), textAlign: 'left' }]}>{String(value)}</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
        <Txt style={[ar(400, 13, 21), { color: C.slate }]}>{label}</Txt>
        <Icon name={icon} size={16} color={C.slate} />
      </View>
    </View>
  );
}
export function MetricsRow({ walk, wait, visit }: { walk: number; wait: number; visit: number }) {
  const div = <View style={{ width: s(1), height: s(40), backgroundColor: C.line }} />;
  return (
    <View style={{
      minHeight: s(79), borderRadius: s(18), backgroundColor: C.canvas, paddingHorizontal: s(14), paddingVertical: s(12),
      flexDirection: 'row', alignItems: 'center', gap: s(12),
    }}>
      <Metric value={visit} label="مدة الزيارة" icon="eye" />
      {div}
      <Metric value={wait} label="انتظار متوقع" icon="wait" />
      {div}
      <Metric value={walk} label="مشي" icon="walk" />
    </View>
  );
}

export { T };
