import { AniListClient } from './anilist/client.js';
import { AniListImporter, PostgresAniListCache } from './app/importer.js';
import { ClassificationService } from './app/classification.js';
import { JobQueue, Worker } from './app/jobs.js';
import { LearningService } from './app/learning.js';
import { ReviewService } from './app/review.js';
import { createDatabase, migrate, type Database } from './db/database.js';
import { PostgresEvidence } from './db/evidence.js';
import { KnowledgeCache, seedConfiguration } from './db/knowledge.js';
import { HashingEmbedder, type Embedder } from './embedding/embedder.js';
import { EngineRegistry, type ClassifierEngine } from './engine/classifier.js';
import type { EvidenceProvider } from './engine/evidence.js';
import { HYBRID_ENGINE_NAME, HybridEngine } from './engine/hybrid.js';
import { createLogger, type Logger } from './observability/logger.js';
import { Metrics } from './observability/metrics.js';

export interface EngineDeps {
  evidence: EvidenceProvider;
  embedder: Embedder;
}

/** Add future engines here. The API, storage and review flow all work against ClassifierEngine. */
export const engines = new EngineRegistry<EngineDeps>().register(
  HYBRID_ENGINE_NAME,
  ({ evidence, embedder }) => new HybridEngine(evidence, embedder),
);

export interface ContainerOptions {
  databaseUrl: string;
  engineName?: string;
  anilist?: AniListClient;
  embedder?: Embedder;
  engineFactory?: (deps: EngineDeps) => ClassifierEngine;
  log?: Logger;
  defaultMetrics?: boolean;
}

export interface Container {
  db: Database;
  log: Logger;
  metrics: Metrics;
  embedder: Embedder;
  knowledge: KnowledgeCache;
  engine: ClassifierEngine;
  learning: LearningService;
  classification: ClassificationService;
  review: ReviewService;
  jobs: JobQueue;
  importer: AniListImporter;
  worker: Worker;
  close(): Promise<void>;
}

/** The one place that knows how the pieces fit together. */
export async function createContainer(options: ContainerOptions): Promise<Container> {
  const log = options.log ?? createLogger();
  const metrics = new Metrics({ defaultMetrics: options.defaultMetrics });
  const db = await createDatabase(options.databaseUrl);

  const applied = await migrate(db);
  if (applied.length > 0) log.info({ applied }, 'migrations applied');
  await seedConfiguration(db);

  const embedder = options.embedder ?? new HashingEmbedder();
  const knowledge = new KnowledgeCache(db);
  const evidence = new PostgresEvidence(db, knowledge);
  const engine = options.engineFactory
    ? options.engineFactory({ evidence, embedder })
    : engines.create(options.engineName ?? HYBRID_ENGINE_NAME, { evidence, embedder });

  const learning = new LearningService();
  const jobs = new JobQueue();
  const classification = new ClassificationService(db, engine, embedder, knowledge, learning, metrics);
  const review = new ReviewService(db, learning, jobs, knowledge, metrics);
  const anilist = options.anilist ?? new AniListClient({ cache: new PostgresAniListCache(db), metrics });
  const importer = new AniListImporter(db, anilist, classification);

  const worker = new Worker(
    db,
    jobs,
    {
      IMPORT_ANIME: (job) => importer.importAnime(job.anime_id),
      RECLASSIFY_SERIES: (job) => classification.classifySeries(job.anime_id),
    },
    metrics,
    log,
  );

  return {
    db,
    log,
    metrics,
    embedder,
    knowledge,
    engine,
    learning,
    classification,
    review,
    jobs,
    importer,
    worker,
    async close() {
      await worker.stop();
      await db.close();
    },
  };
}
