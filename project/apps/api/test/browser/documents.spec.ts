import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
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
  evidenceRepository,
  reviewRepository,
} from '@verity/database';
import { buildApp } from '../../src/app.js';
import { localBlobStore } from '../../src/adapters/local-blobs.js';
import { pdfInspector } from '../../src/adapters/pdf-inspector.js';
import { extractDocument } from '@verity/ingestion';
import { executeReview } from '@verity/agent';
import { scriptedModel } from '../support/scripted-model.js';

const schema = `browser_${randomUUID().replaceAll('-', '')}`;
const connectionString = process.env['TEST_DATABASE_URL'] ?? databaseUrl();
const admin = new Pool({ connectionString });
const pool = new Pool({
  connectionString,
  options: `-c search_path=${schema}`,
});
let app: Awaited<ReturnType<typeof buildApp>>;
let directory: string;
const evidence = evidenceRepository(pool);
const reviews = reviewRepository(pool);
const previousKey = process.env['GEMINI_API_KEY'];

test.beforeAll(async () => {
  // The browser suite executes a deterministic test model, never an external API.
  process.env['GEMINI_API_KEY'] = 'browser-test-placeholder';
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await ensureLocalWorkspace(pool);
  directory = await mkdtemp(join(tmpdir(), 'verity-browser-test-'));
  app = await buildApp({
    repository: documentRepository(pool),
    evidence,
    reviews,
    blobs: localBlobStore(directory),
    inspector: pdfInspector,
    workspaceId: LOCAL_WORKSPACE_ID,
    ready: async () => {
      await pool.query('SELECT 1');
    },
  });
  await app.listen({ host: '127.0.0.1', port: 3001 });
});

test.afterAll(async () => {
  if (previousKey === undefined) delete process.env['GEMINI_API_KEY'];
  else process.env['GEMINI_API_KEY'] = previousKey;
  if (app) await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('uploads, renders, navigates, zooms, persists, and handles upload errors', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '+ Upload document' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('heading', { name: 'Your documents, in focus.' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('empty-workspace.png'),
    fullPage: true,
  });

  const pdf = await PDFDocument.create();
  const first = pdf.addPage([560, 720]);
  first.drawText('Sample policy', { x: 48, y: 650, size: 24 });
  first.drawText('Flood extension limit 1250.', { x: 48, y: 600, size: 14 });
  const second = pdf.addPage([560, 720]);
  second.drawText('Policy conditions', { x: 48, y: 650, size: 24 });
  const buffer = Buffer.from(await pdf.save());
  const upload = {
    name: 'sample-policy.pdf',
    mimeType: 'application/pdf',
    buffer,
  };
  await page.getByLabel('Choose document').setInputFiles(upload);
  const canvas = page.getByRole('img', { name: 'Page 1 of sample-policy.pdf' });
  await expect(canvas).toBeVisible();
  const extractionJob = await evidence.claimExtraction();
  expect(extractionJob).toBeTruthy();
  if (!extractionJob) throw new Error('Expected extraction job');
  await evidence.complete(extractionJob, await extractDocument(buffer, 'pdf'));
  await page
    .getByRole('button', { name: /Flood extension limit 1250/ })
    .click();
  await expect(page.getByLabel('Cited evidence highlight')).toBeVisible();
  // Confirm rendering paints content rather than merely mounting an empty canvas.
  expect(
    await canvas.evaluate((element) => {
      const data = (element as HTMLCanvasElement)
        .getContext('2d')
        ?.getImageData(0, 0, 560, 150).data;
      return (
        data &&
        Array.from(data).some((value, index) => index % 4 !== 3 && value < 150)
      );
    }),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(
    page.getByRole('img', { name: 'Page 2 of sample-policy.pdf' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByText('125%', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Page 2 of sample-policy.pdf' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('pdf-workspace.png'),
    fullPage: true,
  });

  await page.reload();
  await expect(
    page.getByRole('img', { name: 'Page 1 of sample-policy.pdf' }),
  ).toBeVisible();
  await page.getByLabel('Choose document').setInputFiles(upload);
  await expect(
    page.getByRole('status').filter({ hasText: 'is ready to view' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /PDF sample-policy.pdf/ }),
  ).toHaveCount(1);

  await page.getByLabel('Choose document').setInputFiles({
    name: 'invalid.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('Not a PDF'),
  });
  await expect(
    page.getByRole('alert').filter({ hasText: 'valid PDF' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '+ Upload document' }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: 'Document workspace' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('CSV navigation and review findings open original evidence', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const csv = Buffer.from('Coverage,Limit\nFlood extension,1250');
  await expect(
    page.getByRole('button', { name: '+ Upload document' }),
  ).toBeEnabled();
  await page.getByLabel('Choose document').setInputFiles({
    name: 'quotation.csv',
    mimeType: 'text/csv',
    buffer: csv,
  });
  await expect(
    page.getByRole('heading', { name: 'quotation.csv', exact: true }),
  ).toBeVisible();
  const job = await evidence.claimExtraction();
  expect(job).toBeTruthy();
  if (!job) throw new Error('Expected CSV extraction');
  await evidence.complete(job, await extractDocument(csv, 'csv'));
  await expect(
    page.getByRole('cell', { name: '1250', exact: true }),
  ).toBeVisible();
  const documents = await documentRepository(pool).list(
    LOCAL_WORKSPACE_ID,
    100,
    0,
  );
  const policy = documents.find((document) => document.format === 'pdf');
  expect(policy).toBeTruthy();
  if (!policy) throw new Error('Expected policy');
  await page.getByLabel('Policy document').selectOption(policy.id);
  await page.getByRole('checkbox', { name: 'quotation.csv' }).check();
  await page
    .getByLabel('What should we check?')
    .fill('Compare flood extension limits in both directions.');
  await page.getByRole('button', { name: 'Start review', exact: true }).click();
  await expect(page.getByLabel('Review history')).toBeVisible();
  const reviewJob = await reviews.claim();
  expect(reviewJob).toBeTruthy();
  if (!reviewJob) throw new Error('Expected review job');
  await executeReview(
    reviewJob,
    {
      reviews,
      evidence,
      model: scriptedModel(policy.id, job.documentId, evidence),
    },
    new AbortController().signal,
  );
  await expect(
    page.getByText('All checks have verified dispositions'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Source 1 ↗' }).first().click();
  await expect(page.getByLabel('Cited evidence highlight')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('review-with-evidence.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByText('All checks have verified dispositions'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Export report' })).toBeVisible();
  const response = await page.request.get(
    `/api/workspaces/${LOCAL_WORKSPACE_ID}/reviews/${reviewJob.run.id}/report`,
  );
  expect(response.ok()).toBe(true);
  const report = (await response.json()) as {
    citations: { text: string; documentId: string; anchor: { kind: string } }[];
  };
  expect(
    report.citations.some(
      (citation) =>
        citation.documentId === policy.id && citation.anchor.kind === 'pdf',
    ),
  ).toBe(true);
  expect(
    report.citations.some(
      (citation) =>
        citation.documentId === job.documentId &&
        citation.anchor.kind === 'sheet',
    ),
  ).toBe(true);
});
