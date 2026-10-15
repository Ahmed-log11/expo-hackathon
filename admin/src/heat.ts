/**
 * The ledger heatmap's colour: one hue (brand mint -> aqua -> deep teal), light -> dark = few -> many
 * routed visitors. Lightness is monotone; the curve below keeps typical loads light so peaks stand out.
 */
const RAMP = ['#EEF9F6', '#D7F4EE', '#B1EADF', '#77D8C8', '#2FBBA8', '#11857A', '#073C3A'];
const CURVE = 1.9;   // > 1: mid values stay light; only the genuinely busiest slots reach deep teal
const INK = '#102624';

/** Scale floor: a handful of bookings shouldn't already look "full". */
export const HEAT_FLOOR = 8;

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const RAMP_RGB = RAMP.map(rgb);

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function at(t: number): RGB {
  const x = Math.min(1, Math.max(0, t)) * (RAMP_RGB.length - 1);
  const i = Math.min(RAMP_RGB.length - 2, Math.floor(x));
  const f = x - i;
  return RAMP_RGB[i].map((v, k) => Math.round(v + (RAMP_RGB[i + 1][k] - v) * f)) as RGB;
}

/** Fill and text colour for a cell holding `v` visitors on a 0..max scale (null when empty). */
export function heatFill(v: number, max: number): { bg: string; fg: string } | null {
  if (v <= 0) return null;
  const c = at(0.08 + 0.92 * Math.min(1, v / max) ** CURVE);   // anything booked sits visibly above empty
  const l = luminance(c);
  const vsInk = (l + 0.05) / (luminance(rgb(INK)) + 0.05);
  const vsWhite = 1.05 / (l + 0.05);
  return { bg: `rgb(${c.join(',')})`, fg: vsInk >= vsWhite ? INK : '#FFFFFF' };
}
