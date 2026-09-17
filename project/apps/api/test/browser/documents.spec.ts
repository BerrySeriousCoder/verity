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
} from '@verity/database';
import { buildApp } from '../../src/app.js';
import { localBlobStore } from '../../src/adapters/local-blobs.js';
import { pdfInspector } from '../../src/adapters/pdf-inspector.js';

const schema = `browser_${randomUUID().replaceAll('-', '')}`;
const connectionString = process.env['TEST_DATABASE_URL'] ?? databaseUrl();
const admin = new Pool({ connectionString });
const pool = new Pool({
  connectionString,
  options: `-c search_path=${schema}`,
});
let app: Awaited<ReturnType<typeof buildApp>>;
let directory: string;

test.beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await ensureLocalWorkspace(pool);
  directory = await mkdtemp(join(tmpdir(), 'verity-browser-test-'));
  app = await buildApp({
    repository: documentRepository(pool),
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
    page.getByRole('button', { name: '+ Upload PDF' }),
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
  first.drawText('Extension: roadside assistance', { x: 48, y: 600, size: 14 });
  const second = pdf.addPage([560, 720]);
  second.drawText('Policy conditions', { x: 48, y: 650, size: 24 });
  const buffer = Buffer.from(await pdf.save());
  const upload = {
    name: 'sample-policy.pdf',
    mimeType: 'application/pdf',
    buffer,
  };
  await page.getByLabel('Choose PDF').setInputFiles(upload);
  const canvas = page.getByRole('img', { name: 'Page 1 of sample-policy.pdf' });
  await expect(canvas).toBeVisible();
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
  await page.getByLabel('Choose PDF').setInputFiles(upload);
  await expect(
    page.getByRole('status').filter({ hasText: 'is ready to view' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /PDF sample-policy.pdf/ }),
  ).toHaveCount(1);

  await page.getByLabel('Choose PDF').setInputFiles({
    name: 'invalid.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('Not a PDF'),
  });
  await expect(
    page.getByRole('alert').filter({ hasText: 'valid PDF' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '+ Upload PDF' }),
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
