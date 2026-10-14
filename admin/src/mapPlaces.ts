/**
 * Where each place sits on the site image (public/expo-site.png), in its 402 x 874 design units.
 * Copied from the app (app/src/data/mapLayout.ts, PLACE_XY, generated from the Figma map) so the
 * dashboard map matches the phone. If a pavilion is missing here, SiteMap falls back to the
 * x/y (0-100) from GET /pavilions.
 */
export const MAP_W = 402;
export const MAP_H = 874;

export const PLACE_XY: Record<string, { x: number; y: number }> = {
  jp: { x: 113.4, y: 300.0 },
  kr: { x: 300.6, y: 318.3 },
  ksa: { x: 262.8, y: 599.4 },
  th_planet: { x: 207.3, y: 188.4 },
  th_technology: { x: 99.0, y: 560.6 },
  icon: { x: 201.0, y: 440.0 },
  plaza_south: { x: 201.0, y: 528.0 },
  stage: { x: 246.0, y: 512.0 },
  convention: { x: 156.0, y: 512.0 },
  metro: { x: 201.0, y: 846.0 },
  de: { x: 112.0, y: 227.2 },
  cn: { x: 126.7, y: 673.7 },
  ae: { x: 20.9, y: 466.5 },
  us: { x: 314.9, y: 218.6 },
  sg: { x: 346.2, y: 358.3 },
  th_humanity: { x: 285.8, y: 626.8 },
  in: { x: 304.2, y: 374.4 },
  eg: { x: 226.6, y: 586.0 },
  th_culture: { x: 15.2, y: 566.0 },
  fr: { x: 171.1, y: 602.9 },
  it: { x: 43.5, y: 522.2 },
  br: { x: 335.9, y: 316.1 },
  no: { x: 382.5, y: 247.8 },
  ma: { x: 348.3, y: 282.2 },
  id: { x: 259.8, y: 678.7 },
  bh: { x: 55.7, y: 509.2 },
  th_collaboration: { x: 16.1, y: 344.6 },
  gb: { x: 72.2, y: 326.7 },
  ng: { x: 49.0, y: 309.1 },
};
