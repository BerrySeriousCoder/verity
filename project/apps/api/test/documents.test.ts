import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import {
  Pool,
  databaseUrl,
  documentRepository,
  ensureLocalWorkspace,
  LOCAL_WORKSPACE_ID,
  migrate,
} from '@verity/database';
import { MAX_PDF_BYTES } from '@verity/core';
import type { DocumentVersion } from '@verity/core';
import { buildApp } from '../src/app.js';
import { localBlobStore } from '../src/adapters/local-blobs.js';
import { pdfInspector } from '../src/adapters/pdf-inspector.js';

const schema = `test_${randomUUID().replaceAll('-', '')}`;
const connectionString = process.env['TEST_DATABASE_URL'] ?? databaseUrl();
const admin = new Pool({ connectionString });
const pool = new Pool({
  connectionString,
  options: `-c search_path=${schema}`,
});
let app: Awaited<ReturnType<typeof buildApp>>;
let directory: string;
let source: Buffer;
const base = `/api/workspaces/${LOCAL_WORKSPACE_ID}/documents`;

async function fixture(text: string) {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText(text);
  pdf.addPage().drawText('Second page');
  return Buffer.from(await pdf.save());
}

function multipart(files: { filename: string; bytes: Buffer }[]) {
  const boundary = `boundary-${randomUUID()}`;
  const chunks: Buffer[] = [];
  for (const file of files)
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      file.bytes,
      Buffer.from('\r\n'),
    );
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks),
  };
}

before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await ensureLocalWorkspace(pool);
  directory = await mkdtemp(join(tmpdir(), 'verity-api-test-'));
  source = await fixture('Verity test policy');
  app = await buildApp({
    repository: documentRepository(pool),
    blobs: localBlobStore(directory),
    inspector: pdfInspector,
    workspaceId: LOCAL_WORKSPACE_ID,
    ready: async () => {
      await pool.query('SELECT 1');
    },
  });
});

after(async () => {
  if (app) await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('migrations are repeatable and reject changed history', async () => {
  await migrate(pool);
  const result = await pool.query<{ checksum: string }>(
    'SELECT checksum FROM schema_migrations LIMIT 1',
  );
  const original = result.rows[0]?.checksum;
  assert.ok(original);
  await pool.query("UPDATE schema_migrations SET checksum = 'changed'");
  await assert.rejects(migrate(pool), /Migration changed/);
  await pool.query('UPDATE schema_migrations SET checksum = $1', [original]);
});

test('upload, list, and file retrieval preserve original identity and bytes', async () => {
  const uploaded = await app.inject({
    method: 'POST',
    url: base,
    ...multipart([{ filename: 'policy.pdf', bytes: source }]),
  });
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  const { document } = uploaded.json<{ document: DocumentVersion }>();
  assert.equal(document.pageCount, 2);
  assert.equal(
    document.sha256,
    createHash('sha256').update(source).digest('hex'),
  );
  const listed = await app.inject({ url: `${base}?limit=1` });
  assert.equal(
    listed.json<{ documents: DocumentVersion[] }>().documents[0]?.id,
    document.id,
  );
  const file = await app.inject({ url: `${base}/${document.id}/file` });
  assert.equal(file.headers['content-type'], 'application/pdf');
  assert.deepEqual(file.rawPayload, source);
  // A fresh repository instance reads committed data, not process-local state.
  assert.equal(
    (await documentRepository(pool).find(LOCAL_WORKSPACE_ID, document.id))?.id,
    document.id,
  );
});

test('concurrent identical uploads reuse identity; changed bytes retain distinct identity', async () => {
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      app.inject({
        method: 'POST',
        url: base,
        ...multipart([{ filename: 'duplicate.pdf', bytes: source }]),
      }),
    ),
  );
  responses.forEach((response) =>
    assert.equal(response.statusCode, 200, response.body),
  );
  const ids = responses.map(
    (response) => response.json<{ document: DocumentVersion }>().document.id,
  );
  assert.equal(new Set(ids).size, 1);
  const changed = await app.inject({
    method: 'POST',
    url: base,
    ...multipart([
      { filename: 'policy.pdf', bytes: await fixture('Different terms') },
    ]),
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.notEqual(
    changed.json<{ document: DocumentVersion }>().document.id,
    ids[0],
  );
  assert.equal(
    (await readdir(directory)).some((name) => name.endsWith('.tmp')),
    false,
  );
});

test('rejects malformed, encrypted-marked, oversized, and multi-file requests without creating records', async () => {
  const count = async () =>
    (
      await pool.query<{ count: string }>(
        'SELECT count(*) FROM document_versions',
      )
    ).rows[0]?.count;
  const initial = await count();
  for (const bytes of [Buffer.from('not a PDF'), Buffer.from('%PDF-invalid')]) {
    const response = await app.inject({
      method: 'POST',
      url: base,
      ...multipart([{ filename: 'fake.pdf', bytes }]),
    });
    assert.equal(response.statusCode, 422, response.body);
  }
  const encrypted = await PDFDocument.create();
  encrypted.addPage();
  encrypted.context.trailerInfo.Encrypt = encrypted.context.register(
    encrypted.context.obj({ Filter: 'Standard' }),
  );
  const encryptedResponse = await app.inject({
    method: 'POST',
    url: base,
    ...multipart([
      { filename: 'encrypted.pdf', bytes: Buffer.from(await encrypted.save()) },
    ]),
  });
  assert.equal(encryptedResponse.statusCode, 422, encryptedResponse.body);
  const oversized = await app.inject({
    method: 'POST',
    url: base,
    ...multipart([
      { filename: 'large.pdf', bytes: Buffer.alloc(MAX_PDF_BYTES + 1) },
    ]),
  });
  assert.equal(oversized.statusCode, 413, oversized.body);
  const multiple = await app.inject({
    method: 'POST',
    url: base,
    ...multipart([
      { filename: 'first.pdf', bytes: source },
      { filename: 'second.pdf', bytes: source },
    ]),
  });
  assert.equal(multiple.statusCode, 400, multiple.body);
  assert.equal(await count(), initial);
});

test('validates pagination, workspace identity, and cross-workspace reads', async () => {
  assert.equal((await app.inject({ url: `${base}?limit=0` })).statusCode, 400);
  assert.equal(
    (await app.inject({ url: '/api/workspaces/not-a-uuid/documents' }))
      .statusCode,
    400,
  );
  assert.equal(
    (await app.inject({ url: `/api/workspaces/${randomUUID()}/documents` }))
      .statusCode,
    404,
  );
  const document = (
    await documentRepository(pool).list(LOCAL_WORKSPACE_ID, 1, 0)
  )[0];
  assert.ok(document);
  assert.equal(
    (
      await app.inject({
        url: `/api/workspaces/${randomUUID()}/documents/${document.id}/file`,
      })
    ).statusCode,
    404,
  );
  const first = await app.inject({ url: `${base}?limit=1&offset=0` });
  const second = await app.inject({ url: `${base}?limit=1&offset=1` });
  assert.equal(first.json<{ hasMore: boolean }>().hasMore, true);
  assert.notEqual(
    first.json<{ documents: DocumentVersion[] }>().documents[0]?.id,
    second.json<{ documents: DocumentVersion[] }>().documents[0]?.id,
  );
});

test('rejects cross-site writes and non-local hostnames', async () => {
  const body = multipart([{ filename: 'policy.pdf', bytes: source }]);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: base,
        ...body,
        headers: { ...body.headers, origin: 'https://untrusted.example' },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ url: base, headers: { host: 'untrusted.example' } }))
      .statusCode,
    403,
  );
});
