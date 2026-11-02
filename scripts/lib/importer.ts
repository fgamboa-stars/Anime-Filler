import type { CsvRecord } from './csv.ts';
import type { DatasetEpisode, EpisodeType, FillerDataset } from '../../src/types/index.ts';
import { countTypes, fillerPercentage, slugify } from '../../src/utils/dataset.ts';

export const REQUIRED_COLUMNS = ['animeTitle', 'episodeNumber', 'title', 'type'] as const;
export const OPTIONAL_COLUMNS = ['arc', 'anilistId'] as const;
export const DEFAULT_ARC = 'Standalone Episodes';

/** Header aliases (compared case-insensitively, ignoring spaces/underscores). */
const HEADER_ALIASES: Record<string, string> = {
  animetitle: 'animeTitle',
  anime: 'animeTitle',
  series: 'animeTitle',
  episodenumber: 'episodeNumber',
  episode: 'episodeNumber',
  number: 'episodeNumber',
  ep: 'episodeNumber',
  title: 'title',
  episodetitle: 'title',
  type: 'type',
  classification: 'type',
  arc: 'arc',
  anilistid: 'anilistId',
  anilist: 'anilistId',
};

const TYPE_ALIASES: Record<string, EpisodeType> = {
  canon: 'CANON',
  mangacanon: 'CANON',
  filler: 'FILLER',
  mixed: 'MIXED',
  mixedcanonfiller: 'MIXED',
  mixedcanon: 'MIXED',
  animecanon: 'ANIME_CANON',
};

export function normalizeHeader(header: string): string | null {
  return HEADER_ALIASES[header.toLowerCase().replace(/[\s_-]/g, '')] ?? null;
}

export function normalizeType(value: string): EpisodeType | null {
  const key = value.toLowerCase().replace(/[^a-z]/g, '');
  return TYPE_ALIASES[key] ?? null;
}

export interface ImportRow extends DatasetEpisode {
  animeTitle: string;
  anilistId?: number;
  line: number;
}

export interface RejectedRow {
  line: number;
  reason: string;
  raw: Record<string, string>;
}

export interface ValidationResult {
  valid: ImportRow[];
  rejected: RejectedRow[];
  /** Missing required columns — the whole file is unusable when this is non-empty. */
  missingColumns: string[];
  unknownColumns: string[];
}

export function validateRecords(headers: string[], records: CsvRecord[]): ValidationResult {
  const mapping = new Map<string, string>();
  const unknownColumns: string[] = [];
  for (const h of headers) {
    const normalized = normalizeHeader(h);
    if (normalized) mapping.set(h, normalized);
    else unknownColumns.push(h);
  }
  const present = new Set(mapping.values());
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !present.has(c));
  if (missingColumns.length) return { valid: [], rejected: [], missingColumns, unknownColumns };

  const valid: ImportRow[] = [];
  const rejected: RejectedRow[] = [];
  const seen = new Map<string, number>();

  for (const record of records) {
    const v: Record<string, string> = {};
    for (const [raw, normalized] of mapping) v[normalized] = record.values[raw] ?? '';

    const reject = (reason: string) => rejected.push({ line: record.line, reason, raw: record.values });
    const animeTitle = v.animeTitle?.trim();
    const title = v.title?.trim();
    const numberText = v.episodeNumber?.trim();
    const typeText = v.type?.trim();

    if (!animeTitle) {
      reject('animeTitle is empty');
      continue;
    }
    if (!numberText || !/^\d+$/.test(numberText) || Number(numberText) < 1) {
      reject(`episodeNumber "${numberText ?? ''}" is not a positive whole number`);
      continue;
    }
    if (!title) {
      reject('title is empty');
      continue;
    }
    const type = normalizeType(typeText ?? '');
    if (!type) {
      reject(`type "${typeText ?? ''}" is not one of CANON, FILLER, MIXED, ANIME_CANON`);
      continue;
    }
    let anilistId: number | undefined;
    if (v.anilistId) {
      if (!/^\d+$/.test(v.anilistId)) {
        reject(`anilistId "${v.anilistId}" is not a number`);
        continue;
      }
      anilistId = Number(v.anilistId);
    }
    const number = Number(numberText);
    const key = `${animeTitle.toLowerCase()}#${number}`;
    const firstLine = seen.get(key);
    if (firstLine !== undefined) {
      reject(`duplicate of episode ${number} for "${animeTitle}" on line ${firstLine}`);
      continue;
    }
    seen.set(key, record.line);
    valid.push({
      animeTitle,
      number,
      title,
      type,
      arc: v.arc?.trim() || DEFAULT_ARC,
      anilistId,
      line: record.line,
    });
  }
  return { valid, rejected, missingColumns: [], unknownColumns };
}

export function groupByAnime(rows: ImportRow[]): Map<string, ImportRow[]> {
  const groups = new Map<string, ImportRow[]>();
  for (const row of rows) {
    const key = row.animeTitle;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return groups;
}

export interface BuildOptions {
  title: string;
  slug?: string;
  anilistId: number;
  alternativeTitles?: string[];
  source?: string;
  existing?: FillerDataset | null;
  mode?: 'merge' | 'replace';
  now?: Date;
}

export interface BuildResult {
  dataset: FillerDataset;
  added: number[];
  updated: number[];
  unchanged: number[];
  removed: number[];
  gaps: number[];
}

export function buildDataset(rows: ImportRow[], options: BuildOptions): BuildResult {
  const mode = options.mode ?? 'merge';
  const existing = options.existing ?? null;
  const byNumber = new Map<number, DatasetEpisode>();
  if (existing && mode === 'merge') for (const ep of existing.episodes) byNumber.set(ep.number, ep);

  const added: number[] = [];
  const updated: number[] = [];
  const unchanged: number[] = [];
  for (const row of rows) {
    const next: DatasetEpisode = { number: row.number, title: row.title, type: row.type, arc: row.arc };
    const prev = byNumber.get(row.number) ?? existing?.episodes.find((e) => e.number === row.number);
    if (!prev) added.push(row.number);
    else if (prev.title === next.title && prev.type === next.type && prev.arc === next.arc) unchanged.push(row.number);
    else updated.push(row.number);
    byNumber.set(row.number, next);
  }
  const incoming = new Set(rows.map((r) => r.number));
  const removed =
    mode === 'replace' && existing ? existing.episodes.map((e) => e.number).filter((n) => !incoming.has(n)) : [];

  const episodes = [...byNumber.values()].sort((a, b) => a.number - b.number);
  const max = episodes.length ? episodes[episodes.length - 1].number : 0;
  const present = new Set(episodes.map((e) => e.number));
  const gaps: number[] = [];
  for (let n = 1; n <= max; n++) if (!present.has(n)) gaps.push(n);

  const alternativeTitles = [
    ...new Set([...(existing?.alternativeTitles ?? []), ...(options.alternativeTitles ?? [])]),
  ].filter((t) => t && t !== options.title);

  const dataset: FillerDataset = {
    schemaVersion: 1,
    slug: options.slug ?? existing?.slug ?? slugify(options.title),
    anilistId: options.anilistId,
    title: options.title,
    alternativeTitles,
    totalEpisodes: episodes.length,
    ...(options.source ?? existing?.source ? { source: options.source ?? existing?.source } : {}),
    updatedAt: (options.now ?? new Date()).toISOString(),
    episodes,
  };
  return { dataset, added, updated, unchanged, removed, gaps };
}

export interface ReportInput {
  file: string;
  totalRecords: number;
  parseErrors: { line: number; message: string }[];
  rejected: RejectedRow[];
  unknownColumns: string[];
  results: { result: BuildResult; outputPath: string; anilistIdSource: string }[];
  dryRun: boolean;
}

export function buildReport(input: ReportInput): string {
  const lines: string[] = [];
  lines.push(`# Import report`, '');
  lines.push(`- Source: \`${input.file}\``);
  lines.push(`- Rows read: ${input.totalRecords + input.parseErrors.length}`);
  lines.push(`- Rows rejected: ${input.rejected.length + input.parseErrors.length}`);
  lines.push(`- Mode: ${input.dryRun ? 'dry run (nothing written)' : 'written'}`);
  if (input.unknownColumns.length) lines.push(`- Ignored columns: ${input.unknownColumns.join(', ')}`);
  lines.push('');

  for (const { result, outputPath, anilistIdSource } of input.results) {
    const { dataset } = result;
    const counts = countTypes(dataset.episodes);
    lines.push(`## ${dataset.title}`, '');
    lines.push(`- Slug: \`${dataset.slug}\` → \`${outputPath}\``);
    lines.push(`- AniList ID: ${dataset.anilistId} (${anilistIdSource})`);
    lines.push(`- Episodes in dataset: ${dataset.episodes.length}`);
    lines.push(
      `- Added ${result.added.length}, updated ${result.updated.length}, unchanged ${result.unchanged.length}` +
        (result.removed.length ? `, removed ${result.removed.length}` : ''),
    );
    lines.push(
      `- Canon ${counts.CANON}, Mixed ${counts.MIXED}, Anime canon ${counts.ANIME_CANON}, Filler ${counts.FILLER} (${fillerPercentage(counts)}% filler)`,
    );
    if (result.gaps.length) lines.push(`- ⚠ Missing episode numbers: ${compact(result.gaps)}`);
    lines.push('');
  }

  const problems = [
    ...input.parseErrors.map((e) => ({ line: e.line, reason: e.message })),
    ...input.rejected.map((r) => ({ line: r.line, reason: r.reason })),
  ].sort((a, b) => a.line - b.line);
  if (problems.length) {
    lines.push('## Rejected rows', '', '| Line | Reason |', '| --- | --- |');
    for (const p of problems) lines.push(`| ${p.line} | ${p.reason.replace(/\|/g, '\\|')} |`);
    lines.push('');
  }
  return lines.join('\n');
}

function compact(numbers: number[]): string {
  const parts: string[] = [];
  let start = numbers[0];
  let prev = numbers[0];
  for (const n of [...numbers.slice(1), Number.NaN]) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = n;
    prev = n;
  }
  return parts.join(', ');
}
