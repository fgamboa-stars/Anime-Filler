import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { AniListMetrics } from '../anilist/client.js';

/** One instance per app, so tests can build several apps without colliding in a global registry. */
export class Metrics implements AniListMetrics {
  readonly registry = new Registry();

  private readonly httpDuration = new Histogram({
    name: 'classifier_http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });
  private readonly classifications = new Counter({
    name: 'classifier_classifications_total',
    help: 'Predictions produced',
    labelNames: ['engine', 'category', 'decision'],
    registers: [this.registry],
  });
  private readonly classificationDuration = new Histogram({
    name: 'classifier_classification_duration_seconds',
    help: 'Time spent classifying one episode',
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [this.registry],
  });
  private readonly decisionCacheHits = new Counter({
    name: 'classifier_decision_cache_hits_total',
    help: 'Classifications skipped because inputs and knowledge were unchanged',
    registers: [this.registry],
  });
  private readonly reviews = new Counter({
    name: 'classifier_reviews_total',
    help: 'Human reviews',
    labelNames: ['action'],
    registers: [this.registry],
  });
  private readonly anilistRequests = new Counter({
    name: 'classifier_anilist_requests_total',
    help: 'Requests sent to AniList',
    labelNames: ['outcome'],
    registers: [this.registry],
  });
  private readonly anilistCache = new Counter({
    name: 'classifier_anilist_cache_total',
    help: 'AniList cache lookups',
    labelNames: ['result'],
    registers: [this.registry],
  });
  private readonly jobs = new Counter({
    name: 'classifier_jobs_total',
    help: 'Background jobs finished',
    labelNames: ['kind', 'outcome'],
    registers: [this.registry],
  });

  constructor(options: { defaultMetrics?: boolean } = {}) {
    if (options.defaultMetrics) collectDefaultMetrics({ register: this.registry });
  }

  http(method: string, route: string, status: number, seconds: number): void {
    this.httpDuration.observe({ method, route, status: String(status) }, seconds);
  }
  classified(engine: string, category: string, decision: string, seconds: number): void {
    this.classifications.inc({ engine, category, decision });
    this.classificationDuration.observe(seconds);
  }
  decisionCacheHit(): void {
    this.decisionCacheHits.inc();
  }
  reviewed(action: string): void {
    this.reviews.inc({ action });
  }
  job(kind: string, outcome: 'done' | 'retry' | 'failed'): void {
    this.jobs.inc({ kind, outcome });
  }
  request(outcome: string): void {
    this.anilistRequests.inc({ outcome });
  }
  cache(hit: boolean): void {
    this.anilistCache.inc({ result: hit ? 'hit' : 'miss' });
  }
}
