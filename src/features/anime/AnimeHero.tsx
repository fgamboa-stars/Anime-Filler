import { useState } from 'react';
import { ExternalLink, Star, Users } from 'lucide-react';
import { Poster } from '@/components/Poster';
import { Skeleton } from '@/components/ui/skeleton';
import { FillerAvailabilityBadge } from '@/components/FillerAvailabilityBadge';
import {
  cleanDescription,
  displayTitle,
  formatDate,
  formatFormat,
  formatSeason,
  formatStatus,
  type MediaDetail,
} from '@/services/anilist';
import type { CatalogEntry } from '@/types';

interface AnimeHeroProps {
  media: MediaDetail | null;
  catalog: CatalogEntry | null;
  loading: boolean;
  children?: React.ReactNode;
}

export function AnimeHero({ media, catalog, loading, children }: AnimeHeroProps) {
  const [expanded, setExpanded] = useState(false);
  const title = media ? displayTitle(media.title) : (catalog?.title ?? '');
  const altTitle = media && media.title.romaji && media.title.romaji !== title ? media.title.romaji : null;
  const paragraphs = cleanDescription(media?.description ?? null);
  const long = paragraphs.join(' ').length > 420;

  const dates = media ? [formatDate(media.startDate), formatDate(media.endDate)].filter(Boolean) : [];
  const facts: [string, string | null][] = media
    ? [
        ['Format', formatFormat(media.format)],
        ['Status', formatStatus(media.status)],
        ['Episodes', media.episodes ? String(media.episodes) : catalog ? String(catalog.totalEpisodes) : null],
        ['Season', formatSeason(media.season, media.seasonYear)],
        ['Aired', dates.length ? dates.join(' to ') : null],
        ['Studio', media.studios.nodes.map((s) => s.name).join(', ') || null],
      ]
    : catalog
      ? [['Episodes', String(catalog.totalEpisodes)]]
      : [];

  return (
    <section className="relative">
      <div className="absolute inset-x-0 top-0 h-[22rem] overflow-hidden sm:h-[26rem]" aria-hidden>
        {/* Decorative banner: skipped on small screens, where it would be the slowest thing on the page. */}
        {media?.bannerImage && (
          <picture>
            <source media="(min-width: 640px)" srcSet={media.bannerImage} />
            <img
              src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
              alt=""
              className="absolute inset-0 size-full object-cover opacity-45"
              decoding="async"
              {...{ fetchpriority: 'low' }}
            />
          </picture>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/75 to-background" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-16">
        <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
          {loading && !media ? (
            <Skeleton className="aspect-[2/3] w-36 shrink-0 rounded-lg sm:w-52" />
          ) : (
            <Poster
              src={media?.coverImage.large ?? media?.coverImage.extraLarge}
              srcSet={media?.coverImage.large && media.coverImage.extraLarge ? `${media.coverImage.large} 230w, ${media.coverImage.extraLarge} 460w` : undefined}
              sizes="(min-width: 640px) 208px, 144px"
              color={media?.coverImage.color}
              title={title}
              priority
              className="w-36 shrink-0 shadow-2xl shadow-black/50 ring-1 ring-white/10 sm:w-52"
            />
          )}
          <div className="min-w-0 flex-1 sm:pt-4">
            <FillerAvailabilityBadge available={!!catalog} />
            {title ? (
              <h1 className="mt-3 text-[clamp(2rem,5vw,3.6rem)] leading-[1.02] font-extrabold tracking-[-0.025em]">{title}</h1>
            ) : (
              <Skeleton className="mt-3 h-12 w-3/4" />
            )}
            {altTitle && <p className="mt-2 text-muted-foreground">{altTitle}</p>}

            {media && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                {media.averageScore ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Star className="size-4 fill-mixed text-mixed" aria-hidden />
                    <span className="tabular font-semibold">{media.averageScore}%</span>
                    <span className="text-muted-foreground">average score</span>
                  </span>
                ) : null}
                {media.popularity ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4 text-muted-foreground" aria-hidden />
                    <span className="tabular font-semibold">{media.popularity.toLocaleString('en-US')}</span>
                    <span className="text-muted-foreground">AniList members</span>
                  </span>
                ) : null}
              </div>
            )}

            {media && media.genres.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Genres">
                {media.genres.map((g) => (
                  <li key={g} className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium">
                    {g}
                  </li>
                ))}
              </ul>
            )}

            {loading && !media && (
              <div aria-hidden>
                <Skeleton className="mt-4 h-5 w-64" />
                <div className="mt-4 flex gap-2">
                  {[56, 72, 64, 80].map((w) => (
                    <Skeleton key={w} className="h-[26px] rounded-full" style={{ width: w }} />
                  ))}
                </div>
                <div className="mt-5 space-y-[9px]">
                  {['100%', '96%', '92%', '70%'].map((w) => (
                    <Skeleton key={w} className="h-[15px] max-w-[68ch]" style={{ width: w }} />
                  ))}
                </div>
                <Skeleton className="mt-[13px] h-5 w-20" />
              </div>
            )}

            {paragraphs.length > 0 && (
              <div className="mt-5 max-w-[68ch] text-[15px] leading-relaxed text-muted-foreground">
                <div className={long && !expanded ? 'line-clamp-4' : undefined} id="anime-description">
                  {paragraphs.map((p, i) => (
                    <p key={i} className={i > 0 ? 'mt-3' : undefined}>
                      {p}
                    </p>
                  ))}
                </div>
                {long && (
                  <button
                    type="button"
                    className="mt-2 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                    aria-expanded={expanded}
                    aria-controls="anime-description"
                    onClick={() => setExpanded((e) => !e)}
                  >
                    {expanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {loading && !media && (
          <div aria-hidden className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border/70 py-5 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-12" />
                <Skeleton className="mt-1.5 h-4 w-24" />
              </div>
            ))}
          </div>
        )}
        {loading && !media && <Skeleton aria-hidden className="mt-3 h-4 w-56" />}

        {facts.some(([, v]) => v) && (media || !loading) && (
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border/70 py-5 sm:grid-cols-3 lg:grid-cols-6">
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 text-sm font-semibold">{v}</dd>
                </div>
              ))}
          </dl>
        )}

        {media?.siteUrl && (
          <p className="mt-3 text-xs text-muted-foreground">
            Anime information is provided by{' '}
            <a href={media.siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline">
              AniList <ExternalLink className="size-3" aria-hidden />
            </a>
          </p>
        )}

        {children}
      </div>
    </section>
  );
}
