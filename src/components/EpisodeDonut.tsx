import { memo, useMemo, useState } from 'react';
import type { EpisodeType, EpisodeTypeCounts } from '@/types';
import { TYPE_LABELS } from '@/utils/dataset';
import { cn } from '@/utils/cn';
import { ShareBar } from './ui/share-bar';
import { TYPE_COLOR_CLASS, TYPE_DESCRIPTIONS } from './EpisodeTypeBadge';

/** Clockwise from 12 o'clock: the story types first, filler last, so filler closes the ring. */
const ORDER: EpisodeType[] = ['CANON', 'MIXED', 'ANIME_CANON', 'FILLER'];

const SIZE = 200;
const C = SIZE / 2;
const OUTER = 98;
const INNER = 56;
/** Corner rounding, drawn as a same-colour stroke around a slightly inset sector. */
const CORNER = 6;
/** Surface gap between segments, in px at the ring's mid radius. */
const GAP = 6;
/** Smallest share drawn, so a 1-episode slice stays visible as a sliver (exact figures stay in the legend). */
const MIN_SHARE = 0.012;

function point(r: number, a: number) {
  return `${(C + r * Math.sin(a)).toFixed(3)} ${(C - r * Math.cos(a)).toFixed(3)}`;
}

/** Annular sector from angle a0 to a1 (radians, clockwise from 12 o'clock), inset so the rounding stroke stays inside. */
function sectorPath(a0: number, a1: number): string {
  const ro = OUTER - CORNER;
  const ri = INNER + CORNER;
  const mid = (ro + ri) / 2;
  const pad = (GAP / 2 + CORNER) / mid;
  let s = a0 + pad;
  let e = a1 - pad;
  if (e <= s) {
    // Too thin for corners: collapse to a radial line; the stroke turns it into a rounded sliver.
    s = e = (a0 + a1) / 2;
    return `M ${point(ro, s)} L ${point(ri, s)}`;
  }
  const large = e - s > Math.PI ? 1 : 0;
  return `M ${point(ro, s)} A ${ro} ${ro} 0 ${large} 1 ${point(ro, e)} L ${point(ri, e)} A ${ri} ${ri} 0 ${large} 0 ${point(ri, s)} Z`;
}

export function formatShare(part: number, total: number): string {
  if (!total) return '0%';
  const pct = (part / total) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded === 0 && part > 0 ? '<0.1' : rounded}%`;
}

interface EpisodeDonutProps {
  counts: EpisodeTypeCounts;
  /** Accessible summary of the whole chart. */
  label: string;
  className?: string;
  /** Hide the per-type descriptions in the legend (compact layouts). */
  compact?: boolean;
}

/**
 * Part-to-whole view of a series: one ring segment per episode type, with the filler
 * share in the centre. The legend beside it is the readable table of exact counts, and
 * hovering a segment or legend row brings that type into the centre.
 */
export const EpisodeDonut = memo(function EpisodeDonut({ counts, label, className, compact = false }: EpisodeDonutProps) {
  // Hover/focus previews a type; clicking a slice or legend row pins it.
  const [hovered, setHovered] = useState<EpisodeType | null>(null);
  const [pinned, setPinned] = useState<EpisodeType | null>(null);
  const active = hovered ?? pinned;
  const toggle = (t: EpisodeType) => setPinned((p) => (p === t ? null : t));
  const types = ORDER.filter((t) => counts[t] > 0);
  const total = types.reduce((n, t) => n + counts[t], 0);

  const segments = useMemo(() => {
    if (!total) return [];
    // Give tiny slices a minimum share, taken proportionally from the others.
    const raw = types.map((t) => counts[t] / total);
    const boosted = raw.map((r) => Math.max(r, MIN_SHARE));
    const extra = boosted.reduce((a, b) => a + b, 0) - 1;
    const big = raw.reduce((n, r) => (r > MIN_SHARE ? n + r : n), 0);
    const shares = boosted.map((b, i) => (raw[i] > MIN_SHARE ? b - (extra * raw[i]) / big : b));
    let a = 0;
    return types.map((t, i) => {
      const a0 = a;
      a += shares[i] * Math.PI * 2;
      return { type: t, d: types.length === 1 ? null : sectorPath(a0, a), mid: (a0 + a) / 2 };
    });
  }, [counts, total, types]);

  const focus: EpisodeType = active ?? (counts.FILLER > 0 || !types.length ? 'FILLER' : types[0]);

  return (
    <figure
      className={cn(
        'grid items-center gap-8 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-10 lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-14',
        className,
      )}
    >
      <div className="relative mx-auto aspect-square w-full max-w-[15rem] lg:max-w-[17rem]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full overflow-visible" role="img" aria-label={label}>
          {segments.map((seg, i) =>
            seg.d === null ? (
              <circle
                key={seg.type}
                cx={C}
                cy={C}
                r={(OUTER + INNER) / 2}
                fill="none"
                strokeWidth={OUTER - INNER}
                className={cn('animate-donut-in', TYPE_STROKE[seg.type])}
              />
            ) : (
              <g
                key={seg.type}
                className="transition-transform duration-200 ease-out motion-reduce:transition-none"
                style={{
                  transform:
                    active === seg.type
                      ? `translate(${(Math.sin(seg.mid) * 4).toFixed(2)}px, ${(-Math.cos(seg.mid) * 4).toFixed(2)}px)`
                      : undefined,
                }}
              >
                <path
                  d={seg.d}
                  strokeWidth={CORNER * 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  onMouseEnter={() => setHovered(seg.type)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => toggle(seg.type)}
                  style={{ animationDelay: `${i * 70}ms`, transformOrigin: 'center' }}
                  className={cn(
                    'animate-donut-in cursor-pointer transition-opacity duration-150',
                    TYPE_FILL[seg.type],
                    TYPE_STROKE[seg.type],
                    active && active !== seg.type && 'opacity-30',
                  )}
                >
                  <title>{`${TYPE_LABELS[seg.type]}: ${counts[seg.type]} episodes (${formatShare(counts[seg.type], total)})`}</title>
                </path>
              </g>
            ),
          )}
        </svg>
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="tabular text-4xl leading-none font-extrabold tracking-[-0.06em] text-foreground lg:text-[2.75rem]">
            {formatShare(counts[focus], total)}
          </span>
          <span className="mt-1.5 inline-flex max-w-[9rem] items-center gap-1.5 text-sm leading-tight font-medium text-muted-foreground">
            <span className={cn('size-2 shrink-0 rounded-[2px]', TYPE_COLOR_CLASS[focus])} />
            {TYPE_LABELS[focus].toLowerCase()}
          </span>
        </div>
      </div>

      <figcaption className="min-w-0">
        <span className="sr-only">Episodes by type</span>
        <ul className="flex flex-col gap-1">
          {types.map((t) => {
            const share = (counts[t] / total) * 100;
            return (
              <li key={t}>
                <button
                  type="button"
                  aria-pressed={pinned === t}
                  onMouseEnter={() => setHovered(t)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(t)}
                  onBlur={() => setHovered(null)}
                  onClick={() => toggle(t)}
                  className={cn(
                    'grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 rounded-md border-2 px-3 py-2.5 text-left transition-[opacity,border-color,background-color] duration-150',
                    pinned === t ? 'border-edge bg-surface-2' : 'border-transparent hover:bg-surface-2',
                    active && active !== t && 'opacity-45',
                  )}
                >
                  <span aria-hidden className={cn('size-3 rounded-[3px]', TYPE_COLOR_CLASS[t])} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">{TYPE_LABELS[t]}</span>
                    {!compact && <span className="mt-0.5 hidden text-sm text-muted-foreground sm:block">{TYPE_DESCRIPTIONS[t]}</span>}
                  </span>
                  <span className="tabular text-right">
                    <span className="block text-lg leading-tight font-extrabold tracking-[-0.03em] text-foreground">
                      {formatShare(counts[t], total)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {counts[t]} {counts[t] === 1 ? 'episode' : 'episodes'}
                    </span>
                  </span>
                  <ShareBar value={share} barClassName={TYPE_COLOR_CLASS[t]} className="col-span-3" />
                </button>
              </li>
            );
          })}
        </ul>
      </figcaption>
    </figure>
  );
});

const TYPE_FILL: Record<EpisodeType, string> = {
  CANON: 'fill-canon',
  FILLER: 'fill-filler',
  MIXED: 'fill-mixed',
  ANIME_CANON: 'fill-anime-canon',
};

const TYPE_STROKE: Record<EpisodeType, string> = {
  CANON: 'stroke-canon',
  FILLER: 'stroke-filler',
  MIXED: 'stroke-mixed',
  ANIME_CANON: 'stroke-anime-canon',
};
