import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDocumentService } from './service.js';
import { DocumentError, MAX_PDF_BYTES } from './types.js';
import type {
  BlobStore,
  DocumentRepository,
  DocumentVersion,
} from './types.js';

function setup() {
  const documents: DocumentVersion[] = [];
  const blobs = new Map<string, Uint8Array>();
  const repository: DocumentRepository = {
    workspaceExists: async () => true,
    insertOrFind: async (document) => {
      documents.push(document);
      return document;
    },
    find: async () => null,
    list: async () => documents,
  };
  const store: BlobStore = {
    put: async (hash, bytes) => {
      blobs.set(hash, bytes);
    },
    read: async (hash) => {
      const bytes = blobs.get(hash);
      if (!bytes) throw new Error('Missing blob');
      return bytes;
    },
  };
  const inspector = { inspect: async () => ({ pageCount: 2 }) };
  return {
    documents,
    blobs,
    repository,
    store,
    inspector,
    service: createDocumentService({ repository, blobs: store, inspector }),
  };
}

test('rejects non-PDF and oversized data without persistence', async () => {
  const { service, documents, blobs } = setup();
  for (const [bytes, code] of [
    [Buffer.from('not a PDF'), 'INVALID_PDF'],
    [new Uint8Array(MAX_PDF_BYTES + 1), 'FILE_TOO_LARGE'],
  ] as const) {
    await assert.rejects(
      service.upload('workspace', 'test.pdf', bytes),
      (error: unknown) => error instanceof DocumentError && error.code === code,
    );
  }
  assert.equal(documents.length, 0);
  assert.equal(blobs.size, 0);
});

test('preserves original bytes and strips filename paths from display metadata', async () => {
  const { service, blobs } = setup();
  const bytes = Buffer.from('%PDF-example');
  const document = await service.upload('workspace', '../../policy.pdf', bytes);
  assert.equal(document.filename, 'policy.pdf');
  assert.equal(document.pageCount, 2);
  assert.equal(document.byteSize, bytes.length);
  assert.match(document.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(blobs.get(document.sha256), bytes);
});

test('failed metadata persistence retains the blob for ambiguous-commit safety', async () => {
  const fixture = setup();
  fixture.repository.insertOrFind = async () => {
    throw new Error('Connection lost during commit');
  };
  await assert.rejects(
    fixture.service.upload(
      'workspace',
      'policy.pdf',
      Buffer.from('%PDF-example'),
    ),
    /Connection lost/,
  );
  assert.equal(fixture.blobs.size, 1);
  assert.equal(fixture.documents.length, 0);
});

test('failed blob persistence never creates a public metadata record', async () => {
  const fixture = setup();
  fixture.store.put = async () => {
    throw new Error('Disk full');
  };
  await assert.rejects(
    fixture.service.upload(
      'workspace',
      'policy.pdf',
      Buffer.from('%PDF-example'),
    ),
    /Disk full/,
  );
  assert.equal(fixture.documents.length, 0);
});

test('unknown workspaces cannot create blobs or records', async () => {
  const fixture = setup();
  fixture.repository.workspaceExists = async () => false;
  await assert.rejects(
    fixture.service.upload(
      'missing',
      'policy.pdf',
      Buffer.from('%PDF-example'),
    ),
    (error: unknown) =>
      error instanceof DocumentError && error.code === 'WORKSPACE_NOT_FOUND',
  );
  assert.equal(fixture.blobs.size, 0);
  assert.equal(fixture.documents.length, 0);
});
