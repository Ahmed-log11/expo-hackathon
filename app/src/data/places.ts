/**
 * Site data for display: names, categories and photos for every place.
 * Names and tags come from the team's sim/pavilions.json (the same file the API serves).
 */
import site from '../../../sim/pavilions.json';
import { PHOTOS, PhotoName } from '../assets/images';

export type Place = {
  id: string;
  name_en: string;
  name_ar: string;
  district: string;
  x: number;
  y: number;
  has_queue: boolean;
  capacity_per_hour?: number;
  avg_visit_min?: number;
  popularity?: number;
  indoor?: boolean;
  tags?: string[];
};

export const PLACES: Record<string, Place> = Object.fromEntries((site as any).places.map((p: Place) => [p.id, p]));
export const PAVILION_IDS: string[] = (site as any).places.filter((p: Place) => p.has_queue).map((p: Place) => p.id);

// The design uses shorter display names for a few places.
const DISPLAY: Record<string, string> = {
  ksa: 'الجناح السعودي',
  kr: 'جناح كوريا',
  us: 'جناح أمريكا',
  gb: 'جناح بريطانيا',
};
const SHORT: Record<string, string> = { ksa: 'السعودية', kr: 'كوريا', us: 'أمريكا', gb: 'بريطانيا' };

export function nameOf(id: string) {
  return DISPLAY[id] ?? PLACES[id]?.name_ar ?? id;
}
/** "اليابان" for "جناح اليابان": used in compact sequences (reroute card, alerts). */
export function shortName(id: string) {
  if (SHORT[id]) return SHORT[id];
  return nameOf(id).replace(/^جناح\s+/, '').replace(/^الجناح\s+/, '');
}

const TAG_AR: Record<string, string> = {
  technology: 'التقنية', culture: 'الثقافة', planet: 'الاستدامة', humanity: 'الإنسانية', collaboration: 'التعاون',
};
/** "الثقافة · التقنية": the design lists categories right to left, so the second tag comes first. */
export function categoryOf(id: string) {
  if (id === 'ksa') return 'الثقافة · العمارة';
  const tags = PLACES[id]?.tags ?? [];
  return [...tags].reverse().map((t) => TAG_AR[t] ?? t).join(' · ');
}

const PHOTO_OF: Record<string, PhotoName> = {
  ksa: 'saudi', jp: 'japan', kr: 'korea', th_planet: 'sustainability', th_technology: 'hero',
  th_culture: 'culture', icon: 'tower_dusk', th_humanity: 'aerial_sunset', th_collaboration: 'arts',
};
const POOL: PhotoName[] = ['arts', 'interactive', 'tower_landscape', 'aerial_sunset', 'culture', 'sustainability', 'japan', 'hero'];
export function photoOf(id: string) {
  const name = PHOTO_OF[id] ?? POOL[Math.abs(hash(id)) % POOL.length];
  return PHOTOS[name];
}
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Straight-line walking estimate (same assumptions as engine/site.py: 20 m per grid unit, 75 m/min). */
export function walkMinutes(from: string, to: string) {
  const a = PLACES[from], b = PLACES[to];
  if (!a || !b) return 0;
  const m = Math.hypot(a.x - b.x, a.y - b.y) * 20;
  return Math.max(1, Math.round(m / 75));
}
