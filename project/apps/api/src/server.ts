import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  Pool,
  databaseUrl,
  documentRepository,
  ensureLocalWorkspace,
  LOCAL_WORKSPACE_ID,
  evidenceRepository,
  reviewRepository,
} from '@verity/database';
import { buildApp } from './app.js';
import { localBlobStore } from './adapters/local-blobs.js';
import { pdfInspector } from './adapters/pdf-inspector.js';

if (
  process.env['NODE_ENV'] === 'production' &&
  process.env['VERITY_MANAGED_RUNTIME'] !== '1'
) {
  throw new Error(
    'Use the managed runtime gateway for authenticated production access.',
  );
}

const pool = new Pool({
  connectionString: databaseUrl(),
  max: 10,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (error) =>
  console.error('Idle database connection failed:', error.message),
);
const blobDirectory = process.env['BLOB_DIRECTORY']
  ? resolve(process.env['BLOB_DIRECTORY'])
  : fileURLToPath(new URL('../../../.data/blobs/', import.meta.url));

try {
  // The managed runtime applies migrations before launching services; local dev does so in pnpm dev.
  await ensureLocalWorkspace(pool);
  const app = await buildApp({
    repository: documentRepository(pool),
    evidence: evidenceRepository(pool),
    reviews: reviewRepository(pool),
    blobs: localBlobStore(blobDirectory),
    inspector: pdfInspector,
    workspaceId: LOCAL_WORKSPACE_ID,
    logger: true,
    ...(process.env['PUBLIC_ORIGIN']
      ? { allowedOrigins: [new URL(process.env['PUBLIC_ORIGIN']).origin] }
      : {}),
    ready: async () => {
      await pool.query('SELECT 1');
    },
  });
  app.addHook('onClose', async () => {
    await pool.end();
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await app.close();
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', () => {
    void stop();
  });
  process.once('SIGTERM', () => {
    void stop();
  });
  await app.listen({
    host: '127.0.0.1',
    port: Number(process.env['API_PORT'] ?? 3001),
  });
} catch (error) {
  await pool.end();
  console.error(
    'API startup failed. Check PostgreSQL and run pnpm db:migrate.',
    error,
  );
  process.exitCode = 1;
}
