import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  Pool,
  databaseUrl,
  migrate,
  ensureLocalWorkspace,
  LOCAL_WORKSPACE_ID,
  documentRepository,
  evidenceRepository,
  reviewRepository,
} from '@verity/database';
import { executeReview } from '@verity/agent';
import { scriptedModel as createScriptedModel } from './support/scripted-model.js';

const schema = `reviews_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString: databaseUrl() });
const pool = new Pool({
  connectionString: databaseUrl(),
  options: `-c search_path=${schema}`,
});
const evidence = evidenceRepository(pool),
  reviews = reviewRepository(pool);
let policyId: string, quoteId: string;
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await ensureLocalWorkspace(pool);
  const repository = documentRepository(pool);
  const ids = [];
  for (let index = 0; index < 2; index++) {
    const document = await repository.insertOrFind({
      id: randomUUID(),
      workspaceId: LOCAL_WORKSPACE_ID,
      filename: index ? 'quotation.csv' : 'policy.pdf',
      sha256: String(index + 1).repeat(64),
      byteSize: 100,
      pageCount: 1,
      format: index ? 'csv' : 'pdf',
      createdAt: new Date().toISOString(),
    });
    ids.push(document.id);
    const job = await evidence.claimExtraction();
    assert.ok(job);
    await evidence.complete(job, [
      {
        kind: 'pdf_page',
        label: 'Page 1',
        locator: { pageIndex: 0 },
        warnings: [],
        blocks: [
          {
            text: 'Flood extension limit 1250.',
            anchor: {
              kind: 'pdf',
              pageIndex: 0,
              rectangles: [[10, 10, 100, 25]],
            },
          },
        ],
      },
    ]);
  }
  policyId = ids[0]!;
  quoteId = ids[1]!;
});
after(async () => {
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

async function create() {
  return reviews.create({
    workspaceId: LOCAL_WORKSPACE_ID,
    policyId,
    quotationIds: [quoteId],
    task: 'Compare flood extension limits in both documents.',
    reviewerModel: 'test-double',
    auditorModel: 'test-double',
  });
}

test('clear scope produces bidirectional verified findings and durable checkpoints', async () => {
  const run = await create();
  const job = await reviews.claim();
  assert.equal(job?.run.id, run.id);
  assert.ok(job);
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: createScriptedModel(policyId, quoteId, evidence),
    },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.run.status, 'completed');
  assert.equal(detail?.report?.complete, true);
  assert.equal(detail?.report?.findings.length, 2);
  assert.equal(detail?.report?.auditedUnits, 2);
  assert.equal(
    detail?.trace.filter((step) => step.key.startsWith('audit/')).length,
    2,
  );
  assert.equal(await reviews.detail(randomUUID(), run.id), null);
  await assert.rejects(reviews.saveStep(job, 'late', {}, 'test'), /lease lost/);
});

test('vague requests pause for scope and resume without repeating the saved proposal', async () => {
  const run = await create();
  const job = await reviews.claim();
  assert.ok(job);
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: createScriptedModel(policyId, quoteId, evidence, { vague: true }),
    },
    new AbortController().signal,
  );
  assert.equal(
    (await reviews.detail(LOCAL_WORKSPACE_ID, run.id))?.run.status,
    'needs_scope',
  );
  assert.equal(
    await reviews.confirmScope(LOCAL_WORKSPACE_ID, run.id, {
      description: 'Flood limits only',
      categories: ['Flood'],
      confirmed: true,
    }),
    true,
  );
  const resumed = await reviews.claim();
  assert.ok(resumed);
  await executeReview(
    resumed,
    {
      reviews,
      evidence,
      model: createScriptedModel(policyId, quoteId, evidence),
    },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.report?.complete, true);
  assert.equal(detail?.trace.filter((step) => step.key === 'scope').length, 1);
});

test('a supportive model judge cannot override fabricated citation IDs', async () => {
  const run = await create();
  const job = await reviews.claim();
  assert.ok(job);
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: createScriptedModel(policyId, quoteId, evidence, {
        invalidCitation: true,
      }),
    },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.report?.complete, false);
  assert.ok(
    detail?.report?.findings.every(
      (finding) => finding.status === 'unverified' && !finding.verified,
    ),
  );
});

test('omitted blocks fail closed and cancellation rejects further checkpoints', async () => {
  const run = await create();
  const job = await reviews.claim();
  assert.ok(job);
  await assert.rejects(
    executeReview(
      job,
      {
        reviews,
        evidence,
        model: createScriptedModel(policyId, quoteId, evidence, {
          omitBlock: true,
        }),
      },
      new AbortController().signal,
    ),
    /omitted a source block/,
  );
  assert.equal(
    await reviews.control(LOCAL_WORKSPACE_ID, run.id, 'cancel'),
    true,
  );
  assert.equal(await reviews.heartbeat(job), false);
  await assert.rejects(
    reviews.saveStep(job, 'after-cancel', {}, 'test'),
    /lease lost/,
  );
  assert.equal(
    await reviews.control(LOCAL_WORKSPACE_ID, run.id, 'retry'),
    true,
  );
  const resumed = await reviews.claim();
  assert.ok(resumed);
  await executeReview(
    resumed,
    {
      reviews,
      evidence,
      model: createScriptedModel(policyId, quoteId, evidence),
    },
    new AbortController().signal,
  );
  assert.equal(
    (await reviews.detail(LOCAL_WORKSPACE_ID, run.id))?.report?.complete,
    true,
  );
});

test('batches questions after both directions and keeps user assertions separate from proof', async () => {
  const run = await create();
  const job = await reviews.claim();
  assert.ok(job);
  const model = createScriptedModel(policyId, quoteId, evidence, {
    withQuestions: true,
  });
  await executeReview(
    job,
    { reviews, evidence, model },
    new AbortController().signal,
  );
  const pending = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(pending?.run.status, 'needs_input');
  assert.equal(
    pending?.report?.findings.length,
    2,
    'independent work finishes before questions are presented',
  );
  const findings = pending?.report?.findings;
  assert.ok(findings);
  await assert.rejects(
    reviews.answer(LOCAL_WORKSPACE_ID, run.id, { invented: 'answer' }),
    /pending questions/,
  );
  assert.equal(
    await reviews.answer(
      LOCAL_WORKSPACE_ID,
      run.id,
      Object.fromEntries(
        findings.map((finding) => [finding.id, 'I believe these align.']),
      ),
    ),
    true,
  );
  const resumed = await reviews.claim();
  assert.ok(resumed);
  await executeReview(
    resumed,
    { reviews, evidence, model },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.run.revision, 1);
  assert.equal(detail?.report?.complete, false);
  assert.ok(
    detail?.report?.findings.every(
      (finding) =>
        !finding.verified && finding.userAnswer === 'I believe these align.',
    ),
  );
  assert.equal(
    detail?.trace.filter((step) => step.key.startsWith('inventory/')).length,
    2,
    'saved source inventories are reused',
  );
});

test('review lease reclamation rejects stale checkpoints and resumes committed steps', async () => {
  const run = await create();
  const original = await reviews.claim();
  assert.ok(original);
  await reviews.saveStep(original, 'durable-fixture', { saved: true }, 'test');
  await pool.query(
    "UPDATE review_runs SET lease_until=now()-interval '1 second' WHERE id=$1",
    [run.id],
  );
  const resumed = await reviews.claim();
  assert.ok(resumed);
  assert.equal(resumed.run.id, original.run.id);
  assert.notEqual(resumed.leaseToken, original.leaseToken);
  await assert.rejects(
    reviews.saveStep(original, 'stale', {}, 'test'),
    /lease lost/,
  );
  assert.deepEqual(await reviews.loadStep(run.id, 'durable-fixture'), {
    saved: true,
  });
  await executeReview(
    resumed,
    {
      reviews,
      evidence,
      model: createScriptedModel(policyId, quoteId, evidence),
    },
    new AbortController().signal,
  );
  assert.equal(
    (await reviews.detail(LOCAL_WORKSPACE_ID, run.id))?.report?.complete,
    true,
  );
});
