import type { EngineSettings } from '../domain/settings.js';
import type { Category, EpisodeInput, LabeledEpisode } from '../domain/types.js';
import { CATEGORY_LABELS, emptyDistribution, normalize, topCategory } from '../domain/types.js';
import { saturate, type ContributorResult } from './contributor.js';

export type RunKind = 'CANON_RUN' | 'FILLER_RUN' | 'MIXED_RUN' | 'ANIME_ORIGINAL_ARC' | 'OTHER_RUN';

export interface ArcRun {
  startEpisode: number;
  endEpisode: number;
  category: Category;
  kind: RunKind;
  confidence: number;
  episodeCount: number;
  /** The arc name most of the run's episodes share, if any. */
  name: string | null;
}

/** The importer's placeholder for "no arc": grouping by it would fake an arc out of unrelated episodes. */
export const NO_ARC = 'Standalone Episodes';

function runKind(category: Category): RunKind {
  switch (category) {
    case 'CANON':
      return 'CANON_RUN';
    case 'FILLER':
      return 'FILLER_RUN';
    case 'MIXED':
      return 'MIXED_RUN';
    case 'ANIME_CANON':
      return 'ANIME_ORIGINAL_ARC';
    default:
      return 'OTHER_RUN';
  }
}

/**
 * Segments a series into same-category runs. A short interruption bracketed by the same category on both
 * sides stays inside the run and lowers its confidence: one mixed episode doesn't end a canon arc.
 */
export function detectRuns(episodes: LabeledEpisode[], settings: EngineSettings): ArcRun[] {
  const sorted = [...episodes].sort((a, b) => a.number - b.number);
  const { maxInterruption } = settings.arc;
  const runs: ArcRun[] = [];
  let i = 0;

  while (i < sorted.length) {
    const category = sorted[i]!.category;
    let end = i;
    let j = i + 1;
    while (j < sorted.length) {
      const prev = sorted[j - 1]!;
      const cur = sorted[j]!;
      if (cur.number - prev.number > 1 + maxInterruption) break;
      if (cur.category === category) {
        end = j;
        j++;
        continue;
      }
      let k = j;
      while (k < sorted.length && sorted[k]!.category !== category && k - j < maxInterruption) k++;
      // Only absorb when the run was already established and clearly resumes afterwards.
      if (end - i >= 2 && sorted[k]?.category === category && sorted[k + 1]?.category === category) j = k;
      else break;
    }

    const members = sorted.slice(i, end + 1);
    const same = members.filter((e) => e.category === category);
    const purity = same.length / members.length;
    const trust = same.reduce((sum, e) => sum + settings.trustWeights[e.trust], 0) / same.length;

    const names = new Map<string, number>();
    for (const e of members) if (e.arc && e.arc !== NO_ARC) names.set(e.arc, (names.get(e.arc) ?? 0) + 1);
    const [name, nameCount] = [...names.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

    runs.push({
      startEpisode: members[0]!.number,
      endEpisode: members.at(-1)!.number,
      category,
      kind: runKind(category),
      confidence: Number((purity * trust * saturate(members.length, 3)).toFixed(3)),
      episodeCount: members.length,
      name: nameCount * 2 > members.length ? name : null,
    });
    i = end + 1;
  }
  return runs;
}

function describeRun(run: ArcRun): string {
  const range =
    run.startEpisode === run.endEpisode ? `episode ${run.startEpisode}` : `episodes ${run.startEpisode}-${run.endEpisode}`;
  return `${CATEGORY_LABELS[run.category]} run, ${range}${run.name ? ` ("${run.name}")` : ''}`;
}

/**
 * Votes from nearby episodes, weighted by distance and trust. Being bracketed on both sides by the same
 * category is much stronger evidence than following it, so it gets a boost.
 */
export type EvidenceTier = 'bracketed' | 'adjacent' | 'series' | 'none';

/**
 * How close the nearest trusted labels are. Scores only mean something relative to this, so each tier gets
 * its own calibration curve. LOW trust never lifts the tier: the engine's own guesses can't vouch for it.
 */
export function evidenceTier(
  episode: Pick<EpisodeInput, 'number'>,
  neighbours: LabeledEpisode[],
  hasRelatedProfile: boolean,
  settings: EngineSettings,
): EvidenceTier {
  const trusted = neighbours.filter((n) => n.trust !== 'LOW' && n.number !== episode.number);
  const near = trusted.filter((n) => Math.abs(n.number - episode.number) <= settings.arc.window);
  if (near.some((n) => n.number < episode.number) && near.some((n) => n.number > episode.number)) return 'bracketed';
  if (near.length > 0) return 'adjacent';
  return trusted.length > 0 || hasRelatedProfile ? 'series' : 'none';
}

export function arcContributor(
  episode: EpisodeInput,
  neighbours: LabeledEpisode[],
  settings: EngineSettings,
): ContributorResult & { run: ArcRun | null } {
  const { window, decay, saturation, enclosedBoost } = settings.arc;
  const others = neighbours.filter((n) => n.number !== episode.number);
  const distribution = emptyDistribution();
  let evidence = 0;

  const vote = (category: Category, amount: number) => {
    distribution[category] += amount;
    evidence += amount;
  };

  let left: LabeledEpisode | undefined;
  let right: LabeledEpisode | undefined;
  for (const n of others) {
    const distance = Math.abs(n.number - episode.number);
    if (distance <= window) vote(n.category, settings.trustWeights[n.trust] * decay ** (distance - 1));
    if (n.number < episode.number && (!left || n.number > left.number)) left = n;
    if (n.number > episode.number && (!right || n.number < right.number)) right = n;
  }

  const enclosed =
    left && right && left.category === right.category && right.number - left.number <= 4 ? left.category : null;
  if (enclosed) {
    const trust = Math.min(settings.trustWeights[left!.trust], settings.trustWeights[right!.trust]);
    vote(enclosed, trust * enclosedBoost);
  }

  // Same named arc, however far away: arcs often have filler stretches of their own.
  if (episode.arc && episode.arc !== NO_ARC) {
    for (const n of others) {
      if (n.arc === episode.arc && Math.abs(n.number - episode.number) > window) {
        vote(n.category, settings.trustWeights[n.trust] * 0.1);
      }
    }
  }
  normalize(distribution);

  const reasons: string[] = [];
  let run: ArcRun | null = null;
  if (evidence > 0) {
    const runs = detectRuns(others, settings);
    run =
      runs.find((r) => r.startEpisode <= episode.number && r.endEpisode >= episode.number) ??
      runs.filter((r) => r.endEpisode < episode.number).at(-1) ??
      runs[0] ??
      null;
    const top = topCategory(distribution);
    // Say so when the "run" is only the engine's own guesses, or the reason reads like established fact.
    const nearby = others.filter((n) => Math.abs(n.number - episode.number) <= window);
    const caveat = nearby.every((n) => n.trust === 'LOW') ? ' (unreviewed predictions so far)' : '';
    if (enclosed && run) reasons.push(`Located inside ${describeRun(run)}${caveat}`);
    else if (left && left.category === top && run) reasons.push(`Continues ${describeRun(run)}${caveat}`);
    else if (right && right.category === top && run) reasons.push(`Leads into ${describeRun(run)}${caveat}`);
    else reasons.push(`Nearby episodes lean ${CATEGORY_LABELS[top]}${caveat}`);
  }

  return { name: 'arc', distribution, strength: saturate(evidence, saturation), reasons, run };
}
