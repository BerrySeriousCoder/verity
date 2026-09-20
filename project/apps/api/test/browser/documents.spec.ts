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
const evidence = evidenceRepository(pool),
  reviews = reviewRepository(pool);
let app: Awaited<ReturnType<typeof buildApp>>;
let directory: string;
const previousKey = process.env['GEMINI_API_KEY'];

test.beforeAll(async () => {
  process.env['GEMINI_API_KEY'] = 'browser-test-placeholder';
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await ensureLocalWorkspace(pool);
  directory = await mkdtemp(join(tmpdir(), 'verity-browser-test-'));
  app = await buildApp({
    allowedOrigins: ['http://127.0.0.1:3100'],
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
  await app.listen({ host: '127.0.0.1', port: 3101 });
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

test('prompt-first agent streams activity, exposes tools, and opens cited originals', async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'What should we check?' }),
  ).toBeVisible();
  await expect(page.getByLabel('Attach documents')).toBeEnabled();

  const pdf = await PDFDocument.create();
  pdf.addPage([560, 720]).drawText('Policy: flood extension limit 1250.', {
    x: 48,
    y: 650,
    size: 16,
  });
  const policyBytes = Buffer.from(await pdf.save());
  const quoteBytes = Buffer.from('Coverage,Limit\nFlood extension,1250');
  await page.getByLabel('Attach documents').setInputFiles([
    {
      name: 'final-policy.pdf',
      mimeType: 'application/pdf',
      buffer: policyBytes,
    },
    { name: 'quotation.csv', mimeType: 'text/csv', buffer: quoteBytes },
  ]);
  await expect(
    page.getByText('final-policy.pdf', { exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByText('quotation.csv', { exact: true }).last(),
  ).toBeVisible();

  for (const [format, bytes] of [
    ['pdf', policyBytes],
    ['csv', quoteBytes],
  ] as const) {
    const job = await evidence.claimExtraction();
    expect(job).toBeTruthy();
    if (!job) throw new Error('Expected extraction job');
    await evidence.complete(job, await extractDocument(bytes, format));
  }

  await page
    .getByLabel('Message Verity')
    .fill(
      'final-policy.pdf is the final policy. quotation.csv is the quotation. Compare the flood extension limit in both directions and cite both files.',
    );
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText(/final-policy\.pdf is the final policy/),
  ).toBeVisible();

  const run = await reviews.claim();
  expect(run).toBeTruthy();
  if (!run) throw new Error('Expected review job');
  const files = await documentRepository(pool).list(LOCAL_WORKSPACE_ID, 10, 0);
  const policy = files.find((file) => file.filename === 'final-policy.pdf');
  const quote = files.find((file) => file.filename === 'quotation.csv');
  expect(policy).toBeTruthy();
  expect(quote).toBeTruthy();
  if (!policy || !quote) throw new Error('Fixtures missing');
  await executeReview(
    run,
    { reviews, evidence, model: scriptedModel(policy.id, quote.id, evidence) },
    new AbortController().signal,
  );

  await expect(
    page
      .getByText(
        'Inspecting the supplied evidence before choosing the next step.',
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByText(/Finished checking/)).toBeVisible();
  await expect(
    page.getByText('Flood limit', { exact: true }).first(),
  ).toBeVisible();
  const activity = page
    .locator('details')
    .filter({ hasText: /inspect_document|read_unit/ })
    .first();
  await activity.click();
  await expect(activity.getByText('INPUT')).toBeVisible();
  await page
    .getByRole('button', { name: /Focus Inventory/ })
    .first()
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Focused worker' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to conversation' }).click();
  await page.getByRole('button', { name: /Questionnaire/ }).click();
  const ledger = page.getByRole('complementary', {
    name: 'Review questionnaire',
  });
  await expect(ledger).toBeVisible();
  await expect(ledger.getByText('2 checked · 2 discovered')).toBeVisible();
  await ledger
    .getByRole('button', { name: 'Full screen questionnaire' })
    .click();
  await ledger
    .getByRole('button', { name: /Flood limit/ })
    .first()
    .click();
  await expect(ledger.getByText('Original observations (2)')).toBeVisible();
  await expect(
    ledger.getByRole('heading', { name: 'Policy evidence' }),
  ).toBeVisible();
  await ledger.getByRole('button', { name: 'Source 1 ↗' }).first().click();
  await expect(
    page.getByRole('complementary', { name: 'Source inspector' }),
  ).toBeVisible();
  await expect(page.getByLabel('Cited evidence highlight')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Download report with evidence' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('agent-workspace.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByText(/Finished checking/)).toBeVisible();
  await expect(
    page.getByText('Flood limit', { exact: true }).first(),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('agent workspace remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByLabel('Message Verity')).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Task navigation' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
