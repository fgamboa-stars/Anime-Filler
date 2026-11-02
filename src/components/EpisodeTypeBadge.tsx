import { Check, X, Diamond, CircleDot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { EpisodeType } from '@/types';
import { TYPE_LABELS } from '@/utils/dataset';

const VARIANT = { CANON: 'canon', FILLER: 'filler', MIXED: 'mixed', ANIME_CANON: 'animeCanon' } as const;
const ICON = { CANON: Check, FILLER: X, MIXED: CircleDot, ANIME_CANON: Diamond } as const;

export const TYPE_DESCRIPTIONS: Record<EpisodeType, string> = {
  CANON: 'Adapted from the manga',
  MIXED: 'Part manga, part anime-original',
  ANIME_CANON: 'Anime-original but part of the story',
  FILLER: 'Anime-original side story — safe to skip',
};

export function EpisodeTypeBadge({ type, className }: { type: EpisodeType; className?: string }) {
  const Icon = ICON[type];
  return (
    <Badge variant={VARIANT[type]} className={className} title={TYPE_DESCRIPTIONS[type]}>
      <Icon aria-hidden strokeWidth={2.5} />
      {TYPE_LABELS[type]}
    </Badge>
  );
}

export const TYPE_COLOR_CLASS: Record<EpisodeType, string> = {
  CANON: 'bg-canon',
  FILLER: 'bg-filler',
  MIXED: 'bg-mixed',
  ANIME_CANON: 'bg-anime-canon',
};

export const TYPE_TEXT_CLASS: Record<EpisodeType, string> = {
  CANON: 'text-canon-text',
  FILLER: 'text-filler-text',
  MIXED: 'text-mixed-text',
  ANIME_CANON: 'text-anime-canon-text',
};
