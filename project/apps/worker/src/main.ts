import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  Pool,
  databaseUrl,
  evidenceRepository,
  reviewRepository,
} from '@verity/database';
import { localBlobStore } from '@verity/storage';
import { extractDocument } from '@verity/ingestion';
import { executeReview, geminiModel } from '@verity/agent';

const pool = new Pool({
  connectionString: databaseUrl(),
  max: 5,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (error) =>
  console.error('Worker database connection:', error.message),
);
const evidence = evidenceRepository(pool);
const reviews = reviewRepository(pool);
let activeReview: AbortController | undefined;
const blobs = localBlobStore(
  process.env['BLOB_DIRECTORY']
    ? resolve(process.env['BLOB_DIRECTORY'])
    : fileURLToPath(new URL('../../../.data/blobs/', import.meta.url)),
);
let stopping = false;
process.once('SIGINT', () => {
  stopping = true;
  activeReview?.abort();
});
process.once('SIGTERM', () => {
  stopping = true;
  activeReview?.abort();
});

console.info('Verity worker started.');
async function extractionLoop() {
  while (!stopping) {
    try {
      const job = await evidence.claimExtraction();
      if (!job) {
        await delay(1000);
        continue;
      }
      const heartbeat = setInterval(() => {
        void evidence
          .heartbeat(job)
          .catch((error: unknown) =>
            console.error('Extraction heartbeat failed', error),
          );
      }, 20_000);
      try {
        const units = await extractDocument(
          await blobs.read(job.sha256),
          job.format,
        );
        await evidence.complete(job, units);
        console.info(
          `Extracted document ${job.documentId}: ${units.length} source units.`,
        );
      } catch (error) {
        await evidence.fail(
          job,
          error instanceof Error
            ? error.message
            : 'Document extraction failed.',
        );
        console.error(`Extraction failed for ${job.documentId}.`);
      } finally {
        clearInterval(heartbeat);
      }
    } catch (error) {
      console.error(
        'Worker polling failed; retrying:',
        error instanceof Error ? error.message : 'unknown error',
      );
      await delay(3000);
    }
  }
}

async function reviewLoop() {
  while (!stopping) {
    try {
      const job = await reviews.claim();
      if (!job) {
        await delay(1000);
        continue;
      }
      const controller = new AbortController();
      activeReview = controller;
      const timeout = setTimeout(
        () =>
          controller.abort(
            new Error(
              'Review execution exceeded the two-hour limit. Retry to resume checkpoints.',
            ),
          ),
        2 * 60 * 60 * 1000,
      );
      const heartbeat = setInterval(() => {
        void reviews
          .heartbeat(job)
          .then((owned) => {
            if (!owned)
              controller.abort(new Error('Review cancelled or lease lost.'));
          })
          .catch(() =>
            controller.abort(new Error('Cannot renew review lease.')),
          );
      }, 15000);
      try {
        const key = process.env['GEMINI_API_KEY'];
        if (!key)
          throw new Error(
            'Set GEMINI_API_KEY in project/.env, restart the worker, and retry.',
          );
        await executeReview(
          job,
          {
            reviews,
            evidence,
            model: geminiModel(
              key,
              job.run.reviewerModel,
              job.run.auditorModel,
            ),
          },
          controller.signal,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Review failed.';
        await reviews
          .finish(job, 'failed', 'Review interrupted', {
            error: message.slice(0, 1000),
          })
          .catch(() => undefined);
        console.error(`Review ${job.run.id} interrupted: ${message}`);
      } finally {
        clearTimeout(timeout);
        clearInterval(heartbeat);
        activeReview = undefined;
      }
    } catch (error) {
      console.error(
        'Review polling failed:',
        error instanceof Error ? error.message : 'unknown error',
      );
      await delay(3000);
    }
  }
}

try {
  await Promise.all([extractionLoop(), reviewLoop()]);
} finally {
  await pool.end();
}
