import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleCheck, CircleHelp } from 'lucide-react';
import { AnimeCard, AnimeCardSkeleton } from '@/components/AnimeCard';
import { StateMessage, describeError } from '@/components/StateMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { Segmented } from '@/components/ui/segmented';
import { useLikelyNoFiller } from '@/hooks/useAnimeData';
import { LIKELY_NO_FILLER_MAX_EPISODES, displayTitle, type MediaSummary } from '@/services/anilist';
import { hasFillerData } from '@/services/datasets';
import type { FranchiseGroup } from '@/utils/franchise';

type View = 'verified' | 'likely';

const VERIFIED_PREVIEW = 18;

const GRID = 'mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 md:grid-cols-4 lg:grid-cols-6';

export function VerifiedNoFillerBadge() {
  return (
    <Badge variant="canon">
      <CircleCheck aria-hidden />
      No filler
    </Badge>
  );
}

export function LikelyNoFillerBadge() {
  return (
    <Badge variant="outline">
      <CircleHelp aria-hidden />
      Likely no filler
    </Badge>
  );
}

/**
 * Discover section listing anime without filler: "Verified" comes from this
 * site's episode guides, "Likely" is an AniList-based estimate for anime that
 * have no guide yet.
 */
export function NoFillerSection({ groups, media }: { groups: FranchiseGroup[]; media: MediaSummary[] }) {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('nofiller') === 'likely' ? 'likely' : 'verified';
  const setView = (next: View) =>
    setParams(
      (p) => {
        if (next === 'likely') p.set('nofiller', 'likely');
        else p.delete('nofiller');
        return p;
      },
      { replace: true, preventScrollReset: true },
    );

  const [showAllVerified, setShowAllVerified] = useState(false);
  const verified = groups
    .filter((g) => g.counts.FILLER === 0)
    .map((g) => ({ group: g, media: media.find((m) => m.id === g.first.anilistId) ?? null }))
    .sort((a, b) => (b.media?.popularity ?? 0) - (a.media?.popularity ?? 0) || a.group.title.localeCompare(b.group.title));

  return (
    <section aria-labelledby="no-filler-heading" className="mt-20">
      <SectionHeader
        id="no-filler-heading"
        title="No filler"
        description={
          view === 'verified'
            ? 'Every episode checked: these guides have no filler episodes.'
            : `An estimate for anime without a guide yet: most finished TV series of ${LIKELY_NO_FILLER_MAX_EPISODES} episodes or fewer have no filler (about 1 in 8 in our guides has some).`
        }
        action={
          <Segmented<View>
            label="No-filler list"
            value={view}
            onChange={setView}
            options={[
              { value: 'verified', label: `Verified (${verified.length})` },
              { value: 'likely', label: 'Likely' },
            ]}
          />
        }
      />
      {view === 'verified' ? (
        verified.length ? (
          <>
          <ul className={GRID}>
            {(showAllVerified ? verified : verified.slice(0, VERIFIED_PREVIEW)).map(({ group, media: m }) => (
              <li key={group.key}>
                <AnimeCard
                  id={group.first.anilistId}
                  title={group.title}
                  media={m}
                  catalog={group.first}
                  label={<VerifiedNoFillerBadge />}
                />
                {group.counts.MIXED > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {group.counts.MIXED} mixed {group.counts.MIXED === 1 ? 'episode' : 'episodes'}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {verified.length > VERIFIED_PREVIEW && (
            <Button variant="outline" className="mt-8" onClick={() => setShowAllVerified((v) => !v)}>
              {showAllVerified ? 'Show fewer' : `Show all ${verified.length}`}
            </Button>
          )}
          </>
        ) : (
          <p className="mt-6 text-muted-foreground">No guide is filler-free yet.</p>
        )
      ) : (
        <LikelyList />
      )}
    </section>
  );
}

/** Cards to aim for per "Show more"; AniList pages fetched per load or click, and overall. */
const LIKELY_STEP = 18;
const LIKELY_PAGES_PER_STEP = 3;
const LIKELY_MAX_PAGES = 10;

function LikelyList() {
  const [pages, setPages] = useState(1);
  const [wanted, setWanted] = useState(LIKELY_STEP);
  // Pages may be fetched automatically up to here; each "Show more" raises it a little.
  const [limit, setLimit] = useState(LIKELY_PAGES_PER_STEP);
  const likely = useLikelyNoFiller(pages);
  // Shows with a guide are covered by "Verified" (or have filler), so they are left out here.
  const items = (likely.data?.media ?? []).filter((m) => !hasFillerData(m.id));
  const canLoadMore = Boolean(likely.data?.hasNextPage) && pages < LIKELY_MAX_PAGES;

  // Popular short series mostly have guides now, so one AniList page can leave only a few
  // cards. Fetch a few more pages (each cached for a day) to fill the grid, but never more than
  // LIKELY_PAGES_PER_STEP at once: AniList allows about 30 requests a minute for the whole site.
  useEffect(() => {
    if (likely.status === 'success' && items.length < wanted && canLoadMore && pages < limit) setPages((n) => n + 1);
  }, [likely.status, items.length, wanted, canLoadMore, pages, limit]);

  if (likely.status === 'error' && !likely.data)
    return (
      <StateMessage className="mt-6" title="Couldn’t load the list from AniList" onRetry={likely.retry}>
        {describeError(likely.error)}
      </StateMessage>
    );

  return (
    <>
      <ul className={GRID}>
        {items.map((m) => (
          <li key={m.id}>
            <AnimeCard id={m.id} title={displayTitle(m.title)} media={m} catalog={null} label={<LikelyNoFillerBadge />} />
          </li>
        ))}
        {likely.status === 'loading' &&
          Array.from({ length: 12 }, (_, i) => (
            <li key={`s${i}`}>
              <AnimeCardSkeleton />
            </li>
          ))}
      </ul>
      <p className="mt-8 max-w-prose text-xs text-muted-foreground">
        “Likely” is not checked episode by episode. Recap episodes or the odd original episode can still turn up.
      </p>
      {canLoadMore && (
        <Button
          variant="outline"
          className="mt-6"
          disabled={likely.status === 'loading'}
          onClick={() => {
            setWanted(items.length + LIKELY_STEP);
            setLimit(pages + LIKELY_PAGES_PER_STEP);
            setPages((n) => n + 1);
          }}
        >
          Show more
        </Button>
      )}
    </>
  );
}
