/**
 * Draws routes along the walkways of the illustrated map (data/mapLayout.ts, traced from Figma).
 * This is drawing only: the order of stops, waits and times always come from the API.
 */
import { PLACE_XY, WALK_EDGES, WALK_NODES, WALK_SHADED } from '../data/mapLayout';

export type Pt = { x: number; y: number };

const N = WALK_NODES.length / 2;
const adj: { to: number; w: number }[][] = Array.from({ length: N }, () => []);
for (let i = 0; i < WALK_EDGES.length; i += 2) {
  const a = WALK_EDGES[i], b = WALK_EDGES[i + 1];
  const w = Math.hypot(WALK_NODES[2 * a] - WALK_NODES[2 * b], WALK_NODES[2 * a + 1] - WALK_NODES[2 * b + 1]);
  adj[a].push({ to: b, w });
  adj[b].push({ to: a, w });
}
const node = (i: number): Pt => ({ x: WALK_NODES[2 * i], y: WALK_NODES[2 * i + 1] });

export function placePoint(id: string): Pt {
  const p = PLACE_XY[id] ?? PLACE_XY.icon;
  return { x: p.x, y: p.y };
}

/** Shortest walk between two map nodes (Dijkstra with a small binary heap). */
function shortest(from: number, to: number): number[] {
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap: [number, number][] = [];
  const push = (d: number, v: number) => {
    heap.push([d, v]);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  dist[from] = 0; push(0, from);
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    if (u === to) break;
    for (const e of adj[u]) {
      const nd = d + e.w;
      if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; push(nd, e.to); }
    }
  }
  const out: number[] = [];
  for (let v = to; v !== -1; v = prev[v]) out.push(v);
  return out.reverse();
}

export type Walk = { pts: Pt[]; shaded: boolean[]; len: number; cum: number[] };

const cache = new Map<string, Walk>();
/** The walk between two places, from `a` to `b`, along the drawn paths. */
export function walkBetween(a: string, b: string): Walk {
  const key = `${a}>${b}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const A = PLACE_XY[a] ?? PLACE_XY.icon, B = PLACE_XY[b] ?? PLACE_XY.icon;
  const ids = shortest(A.node, B.node);
  const raw: Pt[] = [{ x: A.x, y: A.y }, ...ids.map(node), { x: B.x, y: B.y }];
  const rawShade = [false, ...ids.map((i) => WALK_SHADED[i] === 1), false];
  // drop near-duplicates, then simplify (keeps curves smooth but light)
  const keep = simplify(raw, 1.4);
  const pts = keep.map((i) => raw[i]);
  const shaded = keep.map((i) => rawShade[i]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const w = { pts, shaded, len: cum[cum.length - 1], cum };
  cache.set(key, w);
  return w;
}

/** Ramer–Douglas–Peucker; returns the indices to keep. */
function simplify(p: Pt[], eps: number): number[] {
  const keep = new Uint8Array(p.length);
  keep[0] = keep[p.length - 1] = 1;
  const stack: [number, number][] = [[0, p.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let best = -1, bd = eps;
    const ax = p[s].x, ay = p[s].y, bx = p[e].x, by = p[e].y;
    const L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((bx - ax) * (ay - p[i].y) - (ax - p[i].x) * (by - ay)) / L;
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([s, best], [best, e]); }
  }
  const out: number[] = [];
  keep.forEach((k, i) => { if (k) out.push(i); });
  return out;
}

/** The walk from any point on the map (e.g. where the visitor stands) to a place. */
export function walkFromPoint(from: Pt, b: string): Walk {
  let best = 0, bd = Infinity;
  for (let i = 0; i < N; i++) {
    const d = (WALK_NODES[2 * i] - from.x) ** 2 + (WALK_NODES[2 * i + 1] - from.y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  const B = PLACE_XY[b] ?? PLACE_XY.icon;
  const ids = shortest(best, B.node);
  const raw: Pt[] = [from, ...ids.map(node), { x: B.x, y: B.y }];
  const rawShade = [false, ...ids.map((i) => WALK_SHADED[i] === 1), false];
  const keep = simplify(raw, 1.4);
  const pts = keep.map((i) => raw[i]);
  const shaded = keep.map((i) => rawShade[i]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, shaded, len: cum[cum.length - 1], cum };
}

export function pointAt(w: Walk, t: number): Pt & { angle: number } {
  const d = Math.max(0, Math.min(1, t)) * w.len;
  let i = 1;
  while (i < w.cum.length - 1 && w.cum[i] < d) i++;
  const a = w.pts[i - 1], b = w.pts[i];
  const seg = w.cum[i] - w.cum[i - 1] || 1;
  const k = (d - w.cum[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** The part of the walk between t0 and t1 (0…1). */
export function slice(w: Walk, t0: number, t1: number): Pt[] {
  const d0 = t0 * w.len, d1 = t1 * w.len;
  const out: Pt[] = [pointAt(w, t0)];
  for (let i = 1; i < w.pts.length - 1; i++) if (w.cum[i] > d0 && w.cum[i] < d1) out.push(w.pts[i]);
  out.push(pointAt(w, t1));
  return out;
}

/** Stretches of the walk under shade canopies, from t0 onward (drawn as the white dotted line). */
export function shadedRuns(w: Walk, t0 = 0): Pt[][] {
  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  const d0 = t0 * w.len;
  for (let i = 0; i < w.pts.length; i++) {
    if (w.shaded[i] && w.cum[i] >= d0) cur.push(w.pts[i]);
    else if (cur.length) { if (cur.length > 1) runs.push(cur); cur = []; }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

export function lengthOf(pts: Pt[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

/** Smooth SVG path through points (Catmull-Rom → cubic Bézier). */
export function toPath(pts: Pt[]): string {
  if (pts.length < 2) return '';
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/** A whole day's route through several places (Plan — Ready mini map). */
export function walkThrough(ids: string[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const w = walkBetween(ids[i], ids[i + 1]);
    out.push(...(i === 0 ? w.pts : w.pts.slice(1)));
  }
  return out;
}
