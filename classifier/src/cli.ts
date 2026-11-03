import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { exportDataset } from './app/export.js';
import { seedFromDatasets } from './app/importer.js';
import { monthlyStats } from './app/stats.js';
import { createContainer, type Container } from './container.js';
import { HYBRID_ENGINE_VERSION } from './engine/hybrid.js';
import { runBacktest } from './eval/backtest.js';
import { loadCorpus } from './eval/corpus.js';
import { fetchMetadataFixture } from './eval/fetchFixture.js';
import { buildReport, renderReport } from './eval/report.js';
import { TokenAuthenticator } from './http/auth.js';
import { buildServer } from './http/server.js';

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(here, '..');
const DATASETS_DIR = process.env.DATASETS_DIR ?? resolve(PACKAGE_ROOT, '..', 'src', 'data', 'anime');
const METADATA_FILE = resolve(PACKAGE_ROOT, 'fixtures', 'anilist-metadata.json');
const CALIBRATION_FILE = resolve(PACKAGE_ROOT, 'fixtures', 'calibration.json');
const REPORT_FILE = resolve(PACKAGE_ROOT, 'docs', 'BACKTEST.md');

const USAGE = `Usage: tsx src/cli.ts <command>

  migrate                   Apply migrations and seed rules
  seed                      Load the site's datasets as curated history, and activate the fitted calibration
  serve                     Run the HTTP API, with a worker unless WORKER=false
  worker                    Run only the background worker
  import <anilistId>        Import and classify one anime now
  reclassify <anilistId>    Re-run the engine on a series' unreviewed episodes
  rebuild-learning          Regenerate profiles, arcs, tag patterns and rule stats
  stats [YYYY-MM]           Print monthly statistics
  export <anilistId> [--dry-run]  Write a dataset for the static site
  backtest                  Replay the datasets, fit calibration, write docs/BACKTEST.md
  fetch-fixture             Re-snapshot AniList metadata for the datasets

Environment: DATABASE_URL (Postgres URL, or pglite:<dir> / pglite:memory), API_TOKENS, PORT, CLASSIFIER_ENGINE, LOG_LEVEL`;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. For local use: DATABASE_URL=pglite:./.pgdata');
  return url;
}

function open(): Promise<Container> {
  return createContainer({
    databaseUrl: databaseUrl(),
    engineName: process.env.CLASSIFIER_ENGINE,
    defaultMetrics: true,
  });
}

async function activateCalibration(container: Container): Promise<void> {
  const { readFileSync, existsSync } = await import('node:fs');
  if (!existsSync(CALIBRATION_FILE)) {
    container.log.warn('No fitted calibration. Scores stay capped below auto-approval until `backtest` has run.');
    return;
  }
  const calibration = JSON.parse(readFileSync(CALIBRATION_FILE, 'utf8')) as { version: string; tiers: unknown };
  await container.db.tx(async (tx) => {
    await tx.query('UPDATE confidence_calibration SET active = false WHERE active');
    await tx.query(
      `INSERT INTO confidence_calibration (version, tiers, active) VALUES ($1, $2::jsonb, true)
       ON CONFLICT (version) DO UPDATE SET tiers = EXCLUDED.tiers, active = true`,
      [calibration.version, JSON.stringify(calibration.tiers)],
    );
  });
  container.knowledge.invalidate();
}

async function waitForShutdown(stop: () => Promise<void>): Promise<void> {
  await new Promise<void>((resolveSignal) => {
    process.once('SIGINT', resolveSignal);
    process.once('SIGTERM', resolveSignal);
  });
  await stop();
}

function positiveId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Expected an AniList ID, got "${value ?? ''}"`);
  return id;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'dry-run': { type: 'boolean', default: false } },
  });
  const [command, argument] = positionals;

  switch (command) {
    case 'backtest': {
      const corpus = loadCorpus(DATASETS_DIR, METADATA_FILE);
      const samples = await runBacktest(corpus);
      const report = buildReport(samples, corpus.length, `hybrid-${HYBRID_ENGINE_VERSION}-${new Date().toISOString().slice(0, 10)}`);
      mkdirSync(dirname(REPORT_FILE), { recursive: true });
      writeFileSync(REPORT_FILE, renderReport(report));
      writeFileSync(CALIBRATION_FILE, `${JSON.stringify(report.calibration)}\n`);
      console.log(renderReport(report));
      return;
    }
    case 'fetch-fixture': {
      const metadata = await fetchMetadataFixture(DATASETS_DIR, METADATA_FILE);
      console.log(`Wrote metadata for ${metadata.size} anime to ${METADATA_FILE}`);
      return;
    }
    case 'migrate': {
      const container = await open();
      await container.close();
      return;
    }
    case 'seed': {
      const container = await open();
      await activateCalibration(container);
      console.log(await seedFromDatasets(container.db, DATASETS_DIR, METADATA_FILE, container.embedder, container.learning));
      await container.close();
      return;
    }
    case 'serve': {
      const container = await open();
      const authenticator = new TokenAuthenticator(process.env.API_TOKENS ?? '');
      if (!authenticator.configured) container.log.warn('API_TOKENS is empty. Every /v1 route will answer 401.');
      const server = buildServer(container, authenticator);
      await server.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '0.0.0.0' });
      if (process.env.WORKER !== 'false') container.worker.start();
      await waitForShutdown(async () => {
        await server.close();
        await container.close();
      });
      return;
    }
    case 'worker': {
      const container = await open();
      container.worker.start();
      container.log.info('worker started');
      await waitForShutdown(() => container.close());
      return;
    }
    case 'import': {
      const container = await open();
      console.log(await container.importer.importAnime(positiveId(argument)));
      await container.close();
      return;
    }
    case 'reclassify': {
      const container = await open();
      console.log(await container.classification.classifySeries(positiveId(argument)));
      await container.close();
      return;
    }
    case 'rebuild-learning': {
      const container = await open();
      console.log(await container.db.tx((tx) => container.learning.rebuildAll(tx)));
      await container.close();
      return;
    }
    case 'stats': {
      const container = await open();
      console.log(JSON.stringify(await monthlyStats(container.db, argument ?? new Date().toISOString().slice(0, 7)), null, 2));
      await container.close();
      return;
    }
    case 'export': {
      const container = await open();
      console.log(await exportDataset(container.db, positiveId(argument), DATASETS_DIR, { dryRun: values['dry-run'] }));
      await container.close();
      return;
    }
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
