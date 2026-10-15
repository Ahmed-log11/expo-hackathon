import { useMemo, useState } from 'react';
import type { AdminStats, History, PavilionCrowd, Site, Status } from '../api';
import { fmt, sum } from '../format';
import { MAP_W, PLACE_XY } from '../mapLayout';
import { t } from '../strings';
import { StatusPill } from './Status';

// The part of the illustrated map where the pavilions are (design units, see mapLayout.ts).
const VIEW_Y0 = 150;
const VIEW_H = 570;
const DOT_R = 13;
const TREND_MIN = 3;   // a district's average moving less than this is noise

const statusOf = (wait: number): Status => (wait < 15 ? 'low' : wait < 40 ? 'medium' : 'high');

interface DistrictRow {
  id: string;
  name: string;
  avg: number;
  counts: Record<Status, number>;
  hottest?: { name: string; wait: number };
  routed: number;
  trend: number | null;
}

/**
 * The site at a glance: the app's illustrated map with one dot per pavilion (colour = status,
 * number = wait now), next to one card per district. Hovering a district card highlights its
 * pavilions on the map; hovering a dot shows its numbers.
 */
export function SiteOverview({ site, crowd, stats, history, onSelect }: {
  site: Site;
  crowd: Record<string, PavilionCrowd>;
  stats?: AdminStats;
  history?: History;
  onSelect: (pid: string) => void;
}) {
  const [focusDistrict, setFocusDistrict] = useState<string | null>(null);
  const [hoverPid, setHoverPid] = useState<string | null>(null);

  const routed = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of stats?.pavilions ?? []) out[p.pavilion_id] = sum(p.routed_next_2h);
    return out;
  }, [stats]);

  const districts = useMemo<DistrictRow[]>(() => (site.districts ?? []).map((d) => {
    const ps = site.pavilions.filter((p) => p.district === d.id && crowd[p.id]);
    const waits = ps.map((p) => crowd[p.id].wait_min);
    const counts: Record<Status, number> = { low: 0, medium: 0, high: 0 };
    for (const p of ps) counts[crowd[p.id].status] += 1;
    const top = ps.reduce<typeof ps[number] | undefined>((a, p) => (!a || crowd[p.id].wait_min > crowd[a.id].wait_min ? p : a), undefined);
    const changes = ps.map((p) => history?.trend[p.id]?.change_min).filter((c): c is number => c != null);
    return {
      id: d.id,
      name: d.name_ar,
      avg: waits.length ? sum(waits) / waits.length : 0,
      counts,
      hottest: top && { name: top.name_ar, wait: crowd[top.id].wait_min },
      routed: sum(ps.map((p) => routed[p.id] ?? 0)),
      trend: changes.length === ps.length && ps.length ? sum(changes) / changes.length : null,
    };
  }).sort((a, b) => b.avg - a.avg), [site, crowd, routed, history]);

  const dots = site.pavilions.filter((p) => PLACE_XY[p.id] && crowd[p.id]);
  const hover = hoverPid ? site.pavilions.find((p) => p.id === hoverPid) : undefined;
  const hoverXY = hoverPid ? PLACE_XY[hoverPid] : undefined;
  const hoverTrend = hoverPid ? history?.trend[hoverPid]?.change_min : null;

  return (
    <section className="site-row">
      <article className="card map-card" aria-labelledby="map-title">
        <div className="map-head">
          <div>
            <h2 id="map-title">{t('mapTitle')}</h2>
            <p className="muted card-sub">{t('mapSub')}</p>
          </div>
          <ul className="map-key" aria-label="key">
            {(['low', 'medium', 'high'] as Status[]).map((s) => (
              <li key={s}><i className={`pill-dot key-${s}`} aria-hidden="true" />{t(s)}</li>
            ))}
          </ul>
        </div>
        <div className="map-box">
          <svg viewBox={`0 ${VIEW_Y0} ${MAP_W} ${VIEW_H}`} role="img" aria-label={t('mapTitle')}>
            <image href={`${import.meta.env.BASE_URL}map/expo-site.png`} x={0} y={0} width={MAP_W} height={874} />
            {dots.map((p) => {
              const { x, y } = PLACE_XY[p.id];
              const c = crowd[p.id];
              const dim = focusDistrict !== null && p.district !== focusDistrict;
              return (
                <g
                  key={p.id}
                  className={`map-dot st-${c.status}${dim ? ' dim' : ''}${hoverPid === p.id ? ' on' : ''}`}
                  transform={`translate(${x},${y})`}
                  onMouseEnter={() => setHoverPid(p.id)}
                  onMouseLeave={() => setHoverPid(null)}
                  onClick={() => onSelect(p.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${p.name_ar}: ${t('min', { n: fmt(c.wait_min) })}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id); } }}
                >
                  {c.status === 'high' && !dim && <circle r={DOT_R + 5} className="glow" />}
                  {c.status === 'high' && !dim && <circle r={DOT_R} className="pulse" />}
                  <circle r={DOT_R + 6} className="hit" />
                  <circle r={DOT_R} className="disc" />
                  <text dy="0.35em" textAnchor="middle">{fmt(c.wait_min)}</text>
                </g>
              );
            })}
          </svg>
          {hover && hoverXY && (
            <div
              className="map-tip"
              style={{ left: `${(hoverXY.x / MAP_W) * 100}%`, top: `${((hoverXY.y - VIEW_Y0) / VIEW_H) * 100}%` }}
            >
              <strong>{hover.name_ar}</strong>
              <StatusPill status={crowd[hover.id].status} wait={crowd[hover.id].wait_min} />
              <span>
                {t('mapTipQueue', { n: fmt(crowd[hover.id].queue_length) })}
                {hoverTrend != null && Math.abs(hoverTrend) >= 5 && (
                  <> · {t(hoverTrend > 0 ? 'distTrendUp' : 'distTrendDown', { n: Math.abs(hoverTrend) })}</>
                )}
              </span>
            </div>
          )}
        </div>
      </article>

      <div className="districts" aria-label={t('distTitle')}>
        {districts.map((d) => {
          const n = d.counts.low + d.counts.medium + d.counts.high;
          return (
            <article
              key={d.id}
              className={`card district${focusDistrict === d.id ? ' on' : ''}`}
              onMouseEnter={() => setFocusDistrict(d.id)}
              onMouseLeave={() => setFocusDistrict(null)}
              tabIndex={0}
              onFocus={() => setFocusDistrict(d.id)}
              onBlur={() => setFocusDistrict(null)}
            >
              <div className="district-head">
                <h3>{d.name}</h3>
                {d.trend != null && Math.abs(d.trend) >= TREND_MIN && (
                  <span className={`trend ${d.trend > 0 ? 'up' : 'down'}`}>
                    {t(d.trend > 0 ? 'distTrendUp' : 'distTrendDown', { n: Math.round(Math.abs(d.trend)) })}
                  </span>
                )}
              </div>
              <div className="district-avg">
                <span className="district-num num">{fmt(d.avg)}<small>{t('kpiUnit')}</small></span>
                <span className={`pill pill-${statusOf(d.avg)}`}><i className="pill-dot" aria-hidden="true" />{t(statusOf(d.avg))}</span>
              </div>
              <p className="district-label">{t('distAvg')}</p>
              <div className="seg" aria-hidden="true">
                {(['high', 'medium', 'low'] as Status[]).map((s) => d.counts[s] > 0 && (
                  <i key={s} className={`seg-${s}`} style={{ flexGrow: d.counts[s] / Math.max(1, n) }} />
                ))}
              </div>
              <div className="district-meta">
                {d.hottest && <p className="district-line hot">{t('distHottest', { name: d.hottest.name, n: fmt(d.hottest.wait) })}</p>}
                <p className="district-line muted">{t('distCounts', d.counts)}</p>
                <p className="district-line muted">{t('distRouted', { n: fmt(d.routed) })}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
