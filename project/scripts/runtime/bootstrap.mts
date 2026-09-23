import { setTimeout as delay } from 'node:timers/promises';
import { readFile, mkdir } from 'node:fs/promises';
import {
  Pool,
  databaseUrl,
  migrate,
  ensureLocalWorkspace,
  documentRepository,
  LOCAL_WORKSPACE_ID,
} from '../../packages/database/src/index.js';
import { createDocumentService } from '../../packages/core/src/index.js';
import { localBlobStore } from '../../packages/storage/src/index.js';
import { pdfInspector } from '../../apps/api/src/adapters/pdf-inspector.js';
const pool = new Pool({
  connectionString: databaseUrl(),
  connectionTimeoutMillis: 5000,
});
try {
  for (let attempt = 0; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      if (attempt === 19)
        throw new Error(
          'Database unavailable after startup retries. Check DATABASE_URL.',
        );
      await delay(1500);
    }
  }
  await migrate(pool);
  await ensureLocalWorkspace(pool);
  const directory = process.env['BLOB_DIRECTORY'];
  if (!directory) throw new Error('BLOB_DIRECTORY is required.');
  await mkdir(directory, { recursive: true });
  if (process.env['SEED_DEMO_DOCUMENTS'] === 'true') {
    const service = createDocumentService({
      repository: documentRepository(pool),
      blobs: localBlobStore(directory),
      inspector: pdfInspector,
    });
    for (const filename of ['demo-policy.pdf', 'demo-placement-slip.xlsx']) {
      const bytes = await readFile(
        new URL(`../../../testdoc/dummy/${filename}`, import.meta.url),
      );
      await service.upload(LOCAL_WORKSPACE_ID, filename, bytes);
    }
    console.info(
      'Demo documents seeded idempotently. No model review was started.',
    );
  }
  console.info('Database migrations and workspace initialization complete.');
} finally {
  await pool.end();
}
