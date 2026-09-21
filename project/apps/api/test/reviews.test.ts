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

async function create(version = 1) {
  const run = await reviews.create({
    workspaceId: LOCAL_WORKSPACE_ID,
    policyId,
    quotationIds: [quoteId],
    task: 'Compare flood extension limits in both documents.',
    reviewerModel: 'test-double',
    auditorModel: 'test-double',
  });
  await pool.query('UPDATE review_runs SET engine_version=$2 WHERE id=$1', [
    run.id,
    version,
  ]);
  return run;
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

test('retries an incomplete model response and accounts for failed-call usage', async () => {
  const run = await create();
  const job = await reviews.claim();
  assert.ok(job);
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: createScriptedModel(policyId, quoteId, evidence, {
        failOnce: true,
      }),
    },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.run.status, 'completed');
  assert.ok((detail?.run.inputTokens ?? 0) >= 7);
  assert.ok((detail?.run.outputTokens ?? 0) >= 11);
  const events = await reviews.events(LOCAL_WORKSPACE_ID, run.id);
  assert.ok(
    events.some(
      (event) =>
        event.kind === 'step_result' &&
        event.data['status'] === 'incomplete' &&
        event.data['retrying'] === true,
    ),
  );
  assert.ok(
    events.some(
      (event) =>
        event.kind === 'assistant' && event.title === 'Retrying model step',
    ),
  );
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

test('parallel review retains all raw members and exposes independent live workers', async () => {
  const run = await create(2);
  const job = await reviews.claim();
  assert.ok(job);
  const base = createScriptedModel(policyId, quoteId, evidence);
  let active = 0,
    peak = 0;
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: {
        async generate(...args) {
          active++;
          peak = Math.max(peak, active);
          try {
            await new Promise((resolve) => setTimeout(resolve, 15));
            return await base.generate(...args);
          } finally {
            active--;
          }
        },
      },
    },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.run.engineVersion, 2);
  assert.equal(detail?.report?.complete, true);
  assert.equal(detail?.checks.length, 2);
  assert.equal(detail?.checks.flatMap((check) => check.members).length, 4);
  assert.ok(
    detail?.checks.every(
      (check) => check.state === 'done' && check.finding?.verified,
    ),
  );
  assert.ok(
    peak > 1 && peak <= Number(process.env['GEMINI_MAX_CONCURRENCY'] ?? 6),
    `observed concurrency ${peak}`,
  );
  assert.ok(detail?.workers.some((worker) => worker.role === 'auditor'));
  assert.ok(detail?.workers.every((worker) => worker.status === 'completed'));
  assert.ok(detail!.run.modelCalls < 15);
  const events = await reviews.events(LOCAL_WORKSPACE_ID, run.id);
  assert.ok(
    events.some(
      (event) =>
        event.kind === 'step_result' &&
        typeof event.data['durationMs'] === 'number' &&
        typeof event.data['queueMs'] === 'number',
    ),
  );
  assert.ok(
    events.some(
      (event) => event.kind === 'assistant_delta' && event.data['workerId'],
    ),
  );
});

test('parallel verification fails closed on fabricated citations', async () => {
  const run = await create(2);
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
  assert.ok(detail?.checks.every((check) => check.finding?.verified === false));
});

test('parallel canonicalization cannot omit raw observations', async () => {
  const run = await create(2);
  const job = await reviews.claim();
  assert.ok(job);
  const base = createScriptedModel(policyId, quoteId, evidence);
  await assert.rejects(
    executeReview(
      job,
      {
        reviews,
        evidence,
        model: {
          async generate(role, instruction, input, schema, signal, onProgress) {
            if (instruction.startsWith('Group only'))
              return {
                value: schema.parse({ groups: [] }),
                model: 'test-double',
                inputTokens: 1,
                outputTokens: 1,
              };
            return base.generate(
              role,
              instruction,
              input,
              schema,
              signal,
              onProgress,
            );
          },
        },
      },
      new AbortController().signal,
    ),
    /each requested ID/,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.checks.length, 4, 'raw observations remain visible');
  await reviews.control(LOCAL_WORKSPACE_ID, run.id, 'cancel');
  await assert.rejects(
    reviews.saveCheck(job, detail!.checks[0]!),
    /lease lost/,
  );
});

test('parallel recovery reuses committed model steps and rejects the old lease', async () => {
  const run = await create(2);
  const original = await reviews.claim();
  assert.ok(original);
  const base = createScriptedModel(policyId, quoteId, evidence);
  await assert.rejects(
    executeReview(
      original,
      {
        reviews,
        evidence,
        model: {
          async generate(...args) {
            if (args[1].startsWith('Independently verify each'))
              throw new Error('simulated process failure');
            return base.generate(...args);
          },
        },
      },
      new AbortController().signal,
    ),
    /simulated process failure/,
  );
  const before = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.ok(before?.checks.every((check) => check.state === 'verifying'));
  await pool.query(
    "UPDATE review_runs SET lease_until=now()-interval '1 second' WHERE id=$1",
    [run.id],
  );
  const resumed = await reviews.claim();
  assert.ok(resumed);
  await assert.rejects(
    reviews.saveCheck(original, before!.checks[0]!),
    /lease lost/,
  );
  const instructions: string[] = [];
  await executeReview(
    resumed,
    {
      reviews,
      evidence,
      model: {
        async generate(...args) {
          instructions.push(args[1]);
          return base.generate(...args);
        },
      },
    },
    new AbortController().signal,
  );
  assert.equal(
    instructions.length,
    1,
    'only unfinished verification calls the model again',
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.report?.complete, true);
  assert.equal(detail?.checks.length, 2);
  assert.equal(
    new Set(
      detail?.checks.flatMap((check) =>
        check.members.map((member) => member.id),
      ),
    ).size,
    4,
  );
});

test('a missing batched verification result cannot become a partial success', async () => {
  const run = await create(2);
  const job = await reviews.claim();
  assert.ok(job);
  const base = createScriptedModel(policyId, quoteId, evidence);
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: {
        async generate(role, instruction, input, schema, signal, onProgress) {
          if (instruction.startsWith('Independently verify each'))
            return {
              value: schema.parse({ items: [] }),
              inputTokens: 1,
              outputTokens: 1,
              model: 'test-double',
            };
          return base.generate(
            role,
            instruction,
            input,
            schema,
            signal,
            onProgress,
          );
        },
      },
    },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.run.status, 'completed');
  assert.equal(detail?.checks.length, 2);
  assert.ok(detail?.checks.every((check) => check.state === 'done'));
  assert.equal(detail?.report?.complete, false);
  assert.ok(detail?.checks.every((check) => check.finding?.verified === false));
  await reviews.control(LOCAL_WORKSPACE_ID, run.id, 'cancel');
});

test('concurrent comparison packets merge every finding without overwriting progress', async () => {
  const run = await create(2);
  const job = await reviews.claim();
  assert.ok(job);
  const base = createScriptedModel(policyId, quoteId, evidence);
  let comparing = 0,
    peak = 0;
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: {
        async generate(role, instruction, input, schema, signal, onProgress) {
          if (instruction.startsWith('Group only')) {
            const members = (
              input as { input: { members: { id: string; title: string }[] } }
            ).input.members;
            return {
              value: schema.parse({
                groups: members.map((member) => ({
                  title: member.title,
                  memberIds: [member.id],
                })),
              }),
              inputTokens: 1,
              outputTokens: 1,
              model: 'test-double',
            };
          }
          if (instruction.startsWith('Inventory every')) {
            const result = await base.generate(
              role,
              instruction,
              input,
              schema,
              signal,
              onProgress,
            );
            const value = result.value as { obligations: { title: string }[] };
            return {
              ...result,
              value: schema.parse({
                ...value,
                obligations: value.obligations.flatMap((item) =>
                  Array.from({ length: 6 }, (_, index) => ({
                    ...item,
                    title: `${item.title} ${index}`,
                  })),
                ),
              }),
            };
          }
          if (instruction.startsWith('Compare every')) {
            comparing++;
            peak = Math.max(peak, comparing);
            try {
              await new Promise((resolve) => setTimeout(resolve, 25));
              return await base.generate(
                role,
                instruction,
                input,
                schema,
                signal,
                onProgress,
              );
            } finally {
              comparing--;
            }
          }
          return base.generate(
            role,
            instruction,
            input,
            schema,
            signal,
            onProgress,
          );
        },
      },
    },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.ok(peak > 1, 'comparison packets actually overlap');
  assert.equal(detail?.checks.length, 24);
  assert.equal(detail?.report?.findings.length, 24);
  assert.equal(
    new Set(detail?.report?.findings.map((finding) => finding.id)).size,
    24,
  );
  assert.equal(detail?.report?.complete, true);
});

test('invalid comparison batch splits into valid single checks without losing findings', async () => {
  const run = await create(2);
  const job = await reviews.claim();
  assert.ok(job);
  const base = createScriptedModel(policyId, quoteId, evidence);
  let invalidBatches = 0;
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: {
        async generate(role, instruction, input, schema, signal, onProgress) {
          const payload = (input as { input: { bundles?: unknown[] } }).input;
          if (
            instruction.startsWith('Compare every') &&
            (payload.bundles?.length ?? 0) > 1
          ) {
            invalidBatches++;
            return {
              value: schema.parse({ items: [] }),
              model: 'test-double',
              inputTokens: 1,
              outputTokens: 1,
            };
          }
          return base.generate(
            role,
            instruction,
            input,
            schema,
            signal,
            onProgress,
          );
        },
      },
    },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(invalidBatches, 2);
  assert.equal(detail?.report?.complete, true);
  assert.equal(detail?.report?.findings.length, 2);
  assert.equal(
    new Set(detail?.report?.findings.map((item) => item.id)).size,
    2,
  );
  assert.ok(
    (await reviews.events(LOCAL_WORKSPACE_ID, run.id)).some(
      (event) => event.title === 'Recovering invalid batch',
    ),
  );
});
