import { createHash } from 'node:crypto';
import type { AnimeMeta, EpisodeInput } from '../domain/types.js';

export interface EmbeddingField {
  name: string;
  text: string;
  weight: number;
}

export type EmbeddingDocument = EmbeddingField[];

/**
 * Anything that turns documents into unit vectors. Dimensions must match the
 * `episode_embeddings.embedding` column; changing the model means re-embedding.
 */
export interface Embedder {
  readonly model: string;
  readonly dimensions: number;
  embed(documents: EmbeddingDocument[]): Promise<Float32Array[]>;
}

function structureBucket(number: number, total: number | null): string {
  if (!total || total <= 0) return number <= 3 ? 'opening' : 'unknown-position';
  const ratio = number / total;
  if (number <= 2) return 'opening';
  if (number >= total - 1) return 'finale';
  return ratio < 0.33 ? 'early' : ratio < 0.66 ? 'middle' : 'late';
}

/** Spec inputs: title, description, tags, genres, arc, story structure, metadata. Title dominates on purpose. */
export function buildEmbeddingDocument(anime: AnimeMeta, episode: EpisodeInput): EmbeddingDocument {
  const fields: EmbeddingDocument = [
    { name: 'title', text: episode.title ?? '', weight: 3 },
    { name: 'description', text: episode.description ?? '', weight: 2 },
    { name: 'episodeTags', text: episode.tags.join(' '), weight: 2 },
    { name: 'arc', text: episode.arc ?? '', weight: 1.5 },
    { name: 'genres', text: anime.genres.join(' '), weight: 0.25 },
    { name: 'mediaTags', text: anime.tags.slice(0, 10).map((t) => t.name).join(' '), weight: 0.25 },
    { name: 'structure', text: structureBucket(episode.number, anime.totalEpisodes), weight: 0.25 },
    { name: 'metadata', text: [anime.format, anime.source].filter(Boolean).join(' '), weight: 0.25 },
  ];
  return fields.filter((f) => f.text.length > 0);
}

/** Detects a stale vector without re-embedding: the hash covers everything the vector was built from. */
export function documentHash(document: EmbeddingDocument, model: string): string {
  return createHash('sha256').update(model).update(JSON.stringify(document)).digest('hex').slice(0, 32);
}

const STOP_WORDS = new Set(
  'a an and are as at be but by for from has he her his in into is it its of on or she that the their they this to was were will with you your'.split(
    ' ',
  ),
);

function fnv1a(text: string, seed = 0x811c9dc5): number {
  let hash = seed;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !STOP_WORDS.has(t));
}

/**
 * Signed feature hashing over words, bigrams and character trigrams. It finds shared wording, not shared
 * meaning, but needs no model, no network and no GPU, and gives the same vector on every machine.
 */
export class HashingEmbedder implements Embedder {
  readonly model: string;

  constructor(readonly dimensions = 384) {
    this.model = `feature-hash-v1-${dimensions}`;
  }

  embedSync(document: EmbeddingDocument): Float32Array {
    const vector = new Float32Array(this.dimensions);
    const add = (feature: string, weight: number) => {
      const hash = fnv1a(feature);
      const index = hash % this.dimensions;
      vector[index]! += (hash >>> 31) & 1 ? weight : -weight;
    };

    for (const { name, text, weight } of document) {
      const tokens = tokenize(text);
      // Metadata fields describe the series, so they only ever match themselves.
      const scope = name === 'title' || name === 'description' ? 'text' : name;
      tokens.forEach((token, i) => {
        add(`${scope}:${token}`, weight);
        const next = tokens[i + 1];
        if (next) add(`${scope}:${token}_${next}`, weight * 0.5);
        if (scope === 'text' && token.length > 4) {
          for (let c = 0; c <= token.length - 3; c++) add(`tri:${token.slice(c, c + 3)}`, weight * 0.15);
        }
      });
    }

    let norm = 0;
    for (const value of vector) norm += value * value;
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < vector.length; i++) vector[i]! /= norm;
    return vector;
  }

  async embed(documents: EmbeddingDocument[]): Promise<Float32Array[]> {
    return documents.map((d) => this.embedSync(d));
  }
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}
