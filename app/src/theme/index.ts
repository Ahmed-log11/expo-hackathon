/**
 * INSYAB design tokens, taken from the Figma file (02 — Foundations, 03 — Components).
 * All sizes are in design units: the design is drawn on a 402 x 874 pt iPhone frame.
 * `s()` turns a design unit into screen points so the layout keeps its proportions on every iPhone.
 */
import { Dimensions, Platform, TextStyle } from 'react-native';
import { Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export const DESIGN_W = 402;
export const DESIGN_H = 874;
export const K = SCREEN_W / DESIGN_W;
/** Screen height expressed in design units (874 on an iPhone 16 Pro). */
export const VIEW_H = SCREEN_H / K;

export const s = (n: number) => { 'worklet'; return n * K; };

const SCALED = new Set([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'top', 'left', 'right', 'bottom', 'start', 'end',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingHorizontal', 'paddingVertical',
  'gap', 'rowGap', 'columnGap',
  'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
  'borderWidth', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth',
  'fontSize', 'lineHeight', 'letterSpacing',
]);

/** Scale every size in a style written in design units. */
export function ds<T extends Record<string, any>>(style: T): T {
  const out: Record<string, any> = {};
  for (const k in style) {
    const v = style[k];
    if (typeof v === 'number' && SCALED.has(k)) out[k] = v * K;
    else if (k === 'boxShadow' && typeof v === 'string') out[k] = scaleShadow(v);
    else out[k] = v;
  }
  return out as T;
}

/** Scale the pixel lengths inside a CSS box-shadow string. */
export function scaleShadow(v: string) {
  return v.replace(/(-?\d*\.?\d+)px/g, (_, n) => `${(parseFloat(n) * K).toFixed(2)}px`);
}

export const C = {
  deep: '#073C3A',
  deepPressed: '#052E2C',
  deepGlass: 'rgba(7,60,58,0.88)',
  ink: '#102624',
  slate: '#4E6663',
  slate2: '#607874',
  muted: '#A9BDB9',
  aqua: '#20CDB8',
  aquaText: '#0B7F72',
  mint: '#CFF5ED',
  mintSoft: '#E8F7F3',
  canvas: '#F3F8F6',
  white: '#FFFFFF',
  line: '#DCE6E2',
  lineSoft: '#E2E7E3',
  track: '#DCE6E2',
  mapBg: '#EEF2EF',
  low: '#34C76F', lowBg: '#DFF5E8', lowText: '#1E7A45',
  mod: '#E7AD32', modBg: '#FBF0D5', modText: '#8A5E00',
  busy: '#F47A3D', busyBg: '#FDE7DB', busyText: '#A6461A',
  critical: '#E45151',
};

export const F = {
  ar400: 'NotoSansArabic_400Regular',
  ar500: 'NotoSansArabic_500Medium',
  ar600: 'NotoSansArabic_600SemiBold',
  ar700: 'NotoSansArabic_700Bold',
};

type W = 400 | 500 | 600 | 700;
/** Arabic text style: Noto Sans Arabic at a weight and size (design units).
 * No lineHeight on purpose: the font's glyphs (hamza, marks) are taller than any line box we set,
 * and iOS clips them and pushes them off-centre. Its natural line height (~2.1 x size) fits and centres them.
 * The Figma line height is still accepted so call sites keep reading like the design. */
export function ar(weight: W, size: number, _figmaLineHeight?: number): TextStyle {
  return {
    fontFamily: F[`ar${weight}` as keyof typeof F],
    fontSize: s(size),
    writingDirection: 'rtl',
  };
}
/** Latin and numbers: SF Pro, the iPhone system font. Figma weight 590 is SF "Semibold". */
export function sf(weight: 400 | 590 | 600 | 700, size: number, lineHeight?: number): TextStyle {
  const fw = weight === 590 ? '600' : (String(weight) as TextStyle['fontWeight']);
  return { fontWeight: fw, fontSize: s(size), lineHeight: lineHeight ? s(lineHeight) : undefined };
}

/** Text styles from the Figma style list (Arabic/...). */
export const T = {
  largeTitle: ar(700, 34, 46),
  title1: ar(700, 28, 38),
  title2: ar(700, 22, 31),
  title2Semi: ar(600, 22, 32),
  title3: ar(600, 20, 28),
  headline: ar(600, 17, 27),
  body: ar(400, 17, 29),
  bodyBold: ar(700, 17, 25),
  callout: ar(400, 16, 26),
  calloutEm: ar(600, 16, 23),
  subhead: ar(400, 15, 24),
  subheadEm: ar(600, 15, 22),
  subheadMed: ar(500, 15, 22),
  footnote: ar(400, 13, 21),
  footnoteEm: ar(600, 13, 19),
  footnoteMed: ar(500, 13, 19),
  caption: ar(500, 12, 18),
  captionEm: ar(600, 12, 17),
};

/** Effects (Figma effect styles), as React Native box-shadow strings in design px. */
export const FX = {
  raised: scaleShadow('0px 2px 8px rgba(8,38,36,0.06), 0px 8px 24px rgba(8,38,36,0.06)'),
  floating: scaleShadow('0px 12px 40px rgba(8,38,36,0.16)'),
  routeGlow: scaleShadow('0px 0px 10px rgba(32,204,184,0.35)'),
  glassClear: scaleShadow('inset 0px 1px 0px rgba(255,255,255,0.55), 0px 4px 16px rgba(8,38,36,0.10)'),
  glassRegular: scaleShadow('inset 0px 1px 0px rgba(255,255,255,0.70), 0px 8px 32px rgba(8,38,36,0.12)'),
};

/** Motion tokens (02 — Foundations · Motion & Interaction). */
export const M = {
  fast: 160,
  standard: 240,
  sheet: 320,
  route: 500,
  hero: 600,
  splash: 2000,
  generating: 2400,
  /** Entries and route draws. */
  flowOut: Easing.bezier(0.22, 1, 0.36, 1),
  /** Splash → Welcome and sheets. */
  continuity: Easing.bezier(0.32, 0.72, 0, 1),
  /** Figma "Ease out", used by the prototype's screen transitions. */
  easeOut: Easing.bezier(0, 0, 0.58, 1),
  /** Camera pans only. */
  easeInOut: Easing.bezier(0.42, 0, 0.58, 1),

  // ---- screen & state motion tokens (one language for the whole app) ----
  /** Quick: tab content, small state swaps. */
  quick: 200,
  /** Standard: wizard steps, content fade-through, sheet content swaps. */
  step: 260,
  /** Emphasized: sheets and detail screens rising in. */
  emphasized: 340,
  /** How far content drifts during a fade-through (design units). */
  drift: 8,
};

export const SCREEN = { W: SCREEN_W, H: SCREEN_H };

/**
 * Safe-area layout. Design offsets were drawn on the 402 x 874 frame; on a device they are kept unless the
 * status bar / Dynamic Island or the Home Indicator needs more room. The web preview has no insets, so it
 * uses the design frame's (iPhone 16 Pro: 62 top, 34 bottom).
 */
export const TAB_BAR_H = 60;
export function useSafe() {
  const i = useSafeAreaInsets();
  const web = Platform.OS === 'web';
  const insetTop = i.top || (web ? s(62) : 0);
  const insetBottom = i.bottom || (web ? s(34) : 0);
  /** Fixed bottom CTA: 12 above the Home Indicator (design: 46 from the frame bottom), 24 on phones without one. */
  const ctaBottom = Math.max(insetBottom + s(12), s(24));
  /** Floating map cards (Next Stop, Reroute): their CTA has its own inner padding. */
  const cardBottom = Math.max(insetBottom + s(6), s(16));
  /** The floating tab bar: a little lower, still clear of the Home Indicator. */
  const floatBottom = Math.max(insetBottom - s(4), s(16));
  return {
    insetTop,
    insetBottom,
    /** A top offset from the design, never above the bottom of the status bar. */
    top: (design: number) => Math.max(s(design), insetTop),
    ctaBottom,
    cardBottom,
    floatBottom,
    /** Scroll padding that clears the tab bar and the space under it. */
    tabClear: floatBottom + s(TAB_BAR_H) + s(16),
  };
}
