import type { PavilionCrowd, Place } from '../api';
import { fmt } from '../format';
import { useI18n } from '../i18n';
import { MAP_H, MAP_W, PLACE_XY } from '../mapPlaces';
import { StatusLegend } from './Status';
import { useTip } from './Tooltip';

/** The part of the site image where the pavilions are (design units). */
const VIEW = { x: 0, y: 160, w: MAP_W, h: 545 };

/** The site as the phone shows it, one pin per pavilion coloured by its crowd status. */
export function SiteMap({ pavilions, crowd, selected, onSelect }: {
  pavilions: Place[];
  crowd: Record<string, PavilionCrowd>;
  selected: string | null;
  onSelect: (pid: string) => void;
}) {
  const { t, name } = useI18n();
  const tip = useTip();
  return (
    <section className="card map-card">
      <header className="card-head">
        <h2>{t('mapTitle')}</h2>
      </header>
      <svg className="map" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role="img" aria-label={t('mapTitle')}>
        <image href={`${import.meta.env.BASE_URL}expo-site.png`} x={0} y={0} width={MAP_W} height={MAP_H} preserveAspectRatio="none" />
        {pavilions.map((p) => {
          const pos = PLACE_XY[p.id] ?? { x: (p.x / 100) * MAP_W, y: (p.y / 100) * MAP_H };
          const c = crowd[p.id];
          return (
            <g
              key={p.id}
              className={`pin ${c?.status ?? 'none'}${selected === p.id ? ' sel' : ''}`}
              transform={`translate(${pos.x} ${pos.y})`}
              onClick={() => onSelect(p.id)}
              onPointerMove={(e) => tip.show(e, {
                value: c ? `${t(c.status)} · ${t('min', { n: fmt(c.wait_min) })}` : t('loading'),
                label: name(p, p.id),
              })}
              onPointerLeave={tip.hide}
            >
              <circle r={14} className="pin-hit" />
              {c?.status === 'high' && <circle r={9} className="pin-pulse" />}
              {selected === p.id && <circle r={13} className="pin-ring" />}
              <circle r={9} className="pin-dot" />
              <text className="pin-label" dy="0.35em">{c ? c.wait_min : ''}</text>
            </g>
          );
        })}
      </svg>
      <StatusLegend />
    </section>
  );
}
