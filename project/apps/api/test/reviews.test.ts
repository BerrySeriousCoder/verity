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
import type { ReviewCheck, ReviewFinding } from '@verity/core';
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
  await pool.query(
    'UPDATE review_runs SET engine_version=$2,batching_version=1 WHERE id=$1',
    [run.id, version],
  );
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
  await pool.query('UPDATE review_runs SET batching_version=2 WHERE id=$1', [
    run.id,
  ]);
  const packetSizes: number[] = [];
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
            packetSizes.push(
              (input as { input: { bundles: unknown[] } }).input.bundles.length,
            );
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
  assert.deepEqual(
    packetSizes.sort((a, b) => a - b),
    [8, 16],
  );
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

async function extraDocument(filename: string, pages = 1) {
  const id = randomUUID();
  const document = await documentRepository(pool).insertOrFind({
    id,
    workspaceId: LOCAL_WORKSPACE_ID,
    filename,
    sha256: id.replaceAll('-', '').repeat(2),
    byteSize: 100,
    pageCount: pages,
    format: 'pdf',
    createdAt: new Date().toISOString(),
  });
  const extraction = await evidence.claimExtraction();
  assert.ok(extraction);
  await evidence.complete(
    extraction,
    Array.from({ length: pages }, (_, pageIndex) => ({
      kind: 'pdf_page',
      label: `Page ${pageIndex + 1}`,
      locator: { pageIndex },
      warnings: [],
      blocks: [
        {
          text: 'Flood extension limit 1250.',
          anchor: {
            kind: 'pdf',
            pageIndex,
            rectangles: [[10, 10, 100, 25]],
          },
        },
      ],
    })),
  );
  return document.id;
}

for (const shape of [
  'three-policies',
  'two-quotations',
  'many-to-many',
] as const) {
  test(`confirmed relationships support ${shape} and isolate evidence`, async () => {
    const extras =
      shape === 'three-policies'
        ? [
            await extraDocument('second-policy.pdf'),
            await extraDocument('third-policy.pdf'),
          ]
        : shape === 'many-to-many'
          ? [
              await extraDocument('another-policy.pdf'),
              await extraDocument('another-quotation.pdf'),
            ]
          : [await extraDocument('second-quotation.pdf')];
    const policyIds =
      shape === 'three-policies'
        ? [policyId, ...extras]
        : shape === 'many-to-many'
          ? [policyId, extras[0]!]
          : [policyId];
    const quotationIds =
      shape === 'three-policies'
        ? [quoteId]
        : shape === 'many-to-many'
          ? [quoteId, extras[1]!]
          : [quoteId, ...extras];
    const groups = policyIds.map((id, index) => ({
      id: `group-${index}`,
      title: `Policy ${index + 1}`,
      policyIds: [id],
      quotationIds,
      description: 'Flood limits applicable to this policy.',
    }));
    const run = await reviews.create({
      workspaceId: LOCAL_WORKSPACE_ID,
      policyId,
      quotationIds: [quoteId, ...extras],
      inferRoles: true,
      task: 'Compare all supplied final policies against the applicable quotation requirements in both directions.',
      reviewerModel: 'test-double',
      auditorModel: 'test-double',
    });
    const base = createScriptedModel(policyId, quoteId, evidence);
    const model: typeof base = {
      async generate(role, instruction, raw, schema, signal, onProgress) {
        const input = (raw as { input: Record<string, unknown> }).input;
        if (instruction.startsWith('Map the attached'))
          return {
            value: schema.parse({
              policyIds,
              quotationIds,
              groups,
              question: null,
            }),
            model: 'test-double',
            inputTokens: 1,
            outputTokens: 1,
          };
        if (instruction.startsWith('Assign each quotation')) {
          const items = input['items'] as { check: { id: string } }[];
          return {
            value: schema.parse({
              items: items.map((item) => ({
                id: item.check.id,
                groupIds: groups.map((group) => group.id),
                uncertain: false,
                reason:
                  'Shared flood requirement applies to the named policies.',
              })),
            }),
            model: 'test-double',
            inputTokens: 1,
            outputTokens: 1,
          };
        }
        if (instruction.startsWith('Compare every')) {
          const bundles = input['bundles'] as {
            relationship: { policyIds: string[]; quotationIds: string[] };
            evidence: { documentId: string }[];
          }[];
          for (const bundle of bundles)
            assert.ok(
              bundle.evidence.every((block) =>
                [
                  ...bundle.relationship.policyIds,
                  ...bundle.relationship.quotationIds,
                ].includes(block.documentId),
              ),
              'unrelated policy evidence must not leak into a comparison',
            );
        }
        return base.generate(
          role,
          instruction,
          raw,
          schema,
          signal,
          onProgress,
        );
      },
    };
    const first = await reviews.claim();
    assert.ok(first);
    await executeReview(
      first,
      { reviews, evidence, model },
      new AbortController().signal,
    );
    const proposal = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
    assert.equal(proposal?.run.status, 'needs_context');
    assert.equal(proposal?.run.documentRelationships?.confirmed, false);
    assert.equal(
      proposal?.checks.length,
      0,
      'no questionnaire before confirmation',
    );
    assert.deepEqual(proposal?.run.policyIds, policyIds);
    assert.equal(
      await reviews.message(
        LOCAL_WORKSPACE_ID,
        run.id,
        'Yes, confirm these relationships.',
      ),
      true,
    );
    const confirmed = await reviews.claim();
    assert.ok(confirmed);
    await executeReview(
      confirmed,
      { reviews, evidence, model },
      new AbortController().signal,
    );
    const result = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
    assert.equal(result?.run.documentRelationships?.confirmed, true);
    assert.equal(result?.report?.complete, true);
    assert.equal(result?.checks.length, shape === 'two-quotations' ? 3 : 6);
    assert.ok(result?.checks.every((check) => check.relationshipId));
    assert.ok(
      policyIds.every((id) =>
        result?.checks.some(
          (check) =>
            check.direction === 'policy_to_quotation' &&
            check.members.some((member) => member.documentId === id),
        ),
      ),
    );
  });
}

test('a relationship correction requires a fresh confirmation before review', async () => {
  const run = await reviews.create({
    workspaceId: LOCAL_WORKSPACE_ID,
    policyId,
    quotationIds: [quoteId],
    inferRoles: true,
    task: 'Compare these documents.',
    reviewerModel: 'test-double',
    auditorModel: 'test-double',
  });
  const base = createScriptedModel(policyId, quoteId, evidence);
  const model: typeof base = {
    async generate(role, instruction, input, schema, signal, onProgress) {
      if (instruction.startsWith('Determine whether the latest'))
        return {
          value: schema.parse({ action: 'revise', question: null }),
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
  };
  const first = await reviews.claim();
  assert.ok(first);
  await executeReview(
    first,
    { reviews, evidence, model },
    new AbortController().signal,
  );
  await reviews.message(
    LOCAL_WORKSPACE_ID,
    run.id,
    'No, change the proposed mapping.',
  );
  const second = await reviews.claim();
  assert.ok(second);
  await executeReview(
    second,
    { reviews, evidence, model },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.run.status, 'needs_context');
  assert.equal(detail?.run.rolesResolved, false);
  assert.equal(detail?.checks.length, 0);
  assert.equal(detail?.run.documentRelationships?.proposedRevision, 1);
  await reviews.control(LOCAL_WORKSPACE_ID, run.id, 'cancel');
});

test('uncertain quotation applicability stays visible and cannot be verified', async () => {
  const run = await reviews.create({
    workspaceId: LOCAL_WORKSPACE_ID,
    policyId,
    quotationIds: [quoteId],
    inferRoles: true,
    task: 'Compare flood limits.',
    reviewerModel: 'test-double',
    auditorModel: 'test-double',
  });
  const base = createScriptedModel(policyId, quoteId, evidence);
  const model: typeof base = {
    async generate(role, instruction, raw, schema, signal, onProgress) {
      if (instruction.startsWith('Assign each quotation')) {
        const input = (raw as { input: { items: { check: { id: string } }[] } })
          .input;
        return {
          value: schema.parse({
            items: input.items.map((item) => ({
              id: item.check.id,
              groupIds: [],
              uncertain: true,
              reason:
                'The source does not establish which policy this requirement applies to.',
            })),
          }),
          model: 'test-double',
          inputTokens: 1,
          outputTokens: 1,
        };
      }
      return base.generate(role, instruction, raw, schema, signal, onProgress);
    },
  };
  let job = await reviews.claim();
  assert.ok(job);
  await executeReview(
    job,
    { reviews, evidence, model },
    new AbortController().signal,
  );
  await reviews.message(LOCAL_WORKSPACE_ID, run.id, 'Yes, confirm.');
  job = await reviews.claim();
  assert.ok(job);
  await executeReview(
    job,
    { reviews, evidence, model },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  const uncertain = detail?.checks.filter(
    (check) => check.applicability?.uncertain,
  );
  assert.equal(uncertain?.length, 1);
  assert.equal(uncertain?.[0]?.finding?.verified, false);
  assert.equal(uncertain?.[0]?.finding?.status, 'unverified');
  assert.equal(detail?.report?.complete, false);
  assert.equal(
    detail?.checks.flatMap((check) => check.members).length,
    4,
    'no original observation is lost',
  );
});

test('legacy resume restores overwritten completed rows before requesting unfinished checks', async () => {
  const run = await create(2);
  const job = await reviews.claim();
  assert.ok(job);
  const policy = await evidence.inspect(LOCAL_WORKSPACE_ID, policyId);
  const quote = await evidence.inspect(LOCAL_WORKSPACE_ID, quoteId);
  const own = (
    await evidence.blocks(LOCAL_WORKSPACE_ID, policy!.units[0]!.id, 0, 10)
  )[0]!;
  const other = (
    await evidence.blocks(LOCAL_WORKSPACE_ID, quote!.units[0]!.id, 0, 10)
  )[0]!;
  const checks: ReviewCheck[] = Array.from({ length: 3 }, (_, index) => ({
    id: `check-resume-${index}`,
    title: 'Flood limit',
    category: 'Flood',
    direction: 'policy_to_quotation',
    state: 'ready',
    members: [
      {
        id: `raw-${index}`,
        title: 'Flood limit',
        documentId: policyId,
        evidenceIds: [own.id],
        references: [],
      },
    ],
    workerId: null,
    finding: null,
  }));
  for (const check of checks) await reviews.saveCheck(job, check);
  const saved: ReviewFinding = {
    id: checks[0]!.id,
    title: 'Flood limit',
    category: 'Flood',
    direction: 'policy_to_quotation',
    status: 'aligned',
    explanation: 'Previously checked result.',
    evidenceIds: [own.id, other.id],
    question: null,
    verified: true,
    verification: 'Verified before interruption.',
    userAnswer: null,
  };
  await reviews.saveStep(
    job,
    'v2/findings/old-packet/revision-0',
    [saved],
    'harness',
  );
  await reviews.saveStep(
    job,
    'v2/compare/old-packet/revision-0/initial',
    { saved: true },
    'reviewer',
  );
  await reviews.finish(job, 'failed', 'Simulated quota failure');
  await reviews.control(LOCAL_WORKSPACE_ID, run.id, 'retry');
  const resumed = await reviews.claim();
  assert.ok(resumed);
  const base = createScriptedModel(policyId, quoteId, evidence);
  const compared: string[] = [];
  await executeReview(
    resumed,
    {
      reviews,
      evidence,
      model: {
        async generate(role, instruction, input, schema, signal, onProgress) {
          assert.ok(
            !/^(Inventory|Group only|Assign each quotation)/.test(instruction),
            'resume must not rebuild finalized questionnaire',
          );
          if (instruction.startsWith('Compare every')) {
            const snapshot = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
            assert.deepEqual(
              snapshot?.checks.find((check) => check.id === saved.id)?.finding,
              saved,
              'completed result restored before model dispatch',
            );
            assert.equal(snapshot?.report?.findings.length, 1);
            compared.push(
              ...(
                input as { input: { bundles: { check: { id: string } }[] } }
              ).input.bundles.map((bundle) => bundle.check.id),
            );
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
  assert.deepEqual(compared.sort(), [checks[1]!.id, checks[2]!.id]);
  const final = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(final?.report?.findings.length, 3);
  assert.deepEqual(
    final?.checks.find((check) => check.id === saved.id)?.finding,
    saved,
  );
  assert.ok(await reviews.loadStep(run.id, 'v2/checklist/revision-0'));
});

test('new inventory batching reads six pages in two packets per independent pass', async () => {
  const multiPagePolicy = await extraDocument('six-page-policy.pdf', 6);
  const run = await reviews.create({
    workspaceId: LOCAL_WORKSPACE_ID,
    policyId: multiPagePolicy,
    quotationIds: [quoteId],
    task: 'Compare flood limits in both directions.',
    reviewerModel: 'test-double',
    auditorModel: 'test-double',
  });
  const job = await reviews.claim();
  assert.ok(job);
  assert.equal(job.run.batchingVersion, 4);
  const base = createScriptedModel(multiPagePolicy, quoteId, evidence);
  const locations: { role: string; locations: string[] }[] = [];
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: {
        async generate(role, instruction, input, schema, signal, onProgress) {
          const payload = (
            input as {
              input: { documentId?: string; blocks?: { location: string }[] };
            }
          ).input;
          if (
            instruction.startsWith('Inventory every') &&
            payload.documentId === multiPagePolicy
          )
            locations.push({
              role,
              locations: payload.blocks!.map((block) => block.location),
            });
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
  assert.equal(locations.length, 4);
  for (const role of ['reviewer', 'auditor'])
    assert.deepEqual(
      locations
        .filter((item) => item.role === role)
        .flatMap((item) => item.locations)
        .sort(),
      ['Page 1', 'Page 2', 'Page 3', 'Page 4', 'Page 5', 'Page 6'],
    );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.report?.inventoriedUnits, 7);
  assert.equal(detail?.report?.auditedUnits, 7);
});

test('efficient review evaluates reciprocal requirements once and retains both verified ledger entries', async () => {
  const run = await create(2);
  await pool.query('UPDATE review_runs SET batching_version=3 WHERE id=$1', [
    run.id,
  ]);
  const job = await reviews.claim();
  assert.ok(job);
  const base = createScriptedModel(policyId, quoteId, evidence);
  let comparisonItems = 0,
    verificationItems = 0;
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: {
        async generate(role, instruction, raw, schema, signal, onProgress) {
          const input = (raw as { input: Record<string, unknown> }).input;
          if (instruction.startsWith('Compare every')) {
            const bundles = input['bundles'] as {
              pairedRequirements: { direction: string }[];
            }[];
            comparisonItems += bundles.length;
            assert.equal(bundles[0]!.pairedRequirements.length, 2);
            assert.equal(
              new Set(
                bundles[0]!.pairedRequirements.map((check) => check.direction),
              ).size,
              2,
            );
          }
          if (instruction.startsWith('Independently verify each')) {
            const items = input['items'] as {
              pairedRequirements: unknown[];
              provisional?: unknown;
            }[];
            verificationItems += items.length;
            assert.equal(items[0]!.pairedRequirements.length, 2);
            assert.equal(items[0]!.provisional, undefined);
          }
          return base.generate(
            role,
            instruction,
            raw,
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
  assert.equal(comparisonItems, 1);
  assert.equal(verificationItems, 1);
  assert.equal(detail?.report?.findings.length, 2);
  assert.equal(detail?.checks.length, 2);
  assert.ok(detail?.report?.findings.every((finding) => finding.verified));
  assert.ok(
    detail?.checks.every(
      (check) =>
        new Set(check.members.map((member) => member.documentId)).size === 1,
    ),
  );
});

test('efficient paired review keeps both directions unverified when citations are invalid', async () => {
  const run = await create(2);
  await pool.query('UPDATE review_runs SET batching_version=3 WHERE id=$1', [
    run.id,
  ]);
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
  assert.equal(detail?.checks.length, 2);
  assert.equal(detail?.report?.findings.length, 2);
  assert.ok(
    detail?.report?.findings.every(
      (finding) => !finding.verified && finding.status === 'unverified',
    ),
  );
});

test('usage accounting persists cache, thinking and latency without charging a checkpoint twice', async () => {
  const run = await create(2);
  const job = await reviews.claim();
  assert.ok(job);
  const usage = {
    model: 'test-double',
    inputTokens: 100,
    outputTokens: 40,
    cachedTokens: 80,
    thoughtTokens: 25,
    promptCharacters: 400,
    queueMs: 5,
    durationMs: 1000,
  };
  await reviews.reserveCall(job);
  await reviews.saveStep(job, 'v2/compare/usage', {}, 'reviewer', usage);
  await reviews.saveStep(job, 'v2/compare/usage', {}, 'reviewer', usage);
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.run.inputTokens, 100);
  assert.equal(detail?.run.cachedTokens, 80);
  assert.equal(detail?.run.thoughtTokens, 25);
  assert.equal(detail?.run.meteredCalls, 1);
  assert.deepEqual(detail?.trace[0]?.usage, {
    cachedTokens: 80,
    thoughtTokens: 25,
    promptCharacters: 400,
    queueMs: 5,
    durationMs: 1000,
  });
  await reviews.control(LOCAL_WORKSPACE_ID, run.id, 'cancel');
});

test('v4 uncertainty accepted by a verifier stays unresolved and summary agrees', async () => {
  const run = await create(2);
  await pool.query('UPDATE review_runs SET batching_version=4 WHERE id=$1', [
    run.id,
  ]);
  const job = await reviews.claim();
  assert.ok(job);
  const base = createScriptedModel(policyId, quoteId, evidence);
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: {
        async generate(role, instruction, raw, schema, signal, onProgress) {
          const result = await base.generate(
            role,
            instruction,
            raw,
            schema,
            signal,
            onProgress,
          );
          if (instruction.startsWith('Compare every')) {
            const value = result.value as {
              items: {
                decision: { status: string; question: string | null };
              }[];
            };
            for (const item of value.items) {
              item.decision.status = 'unverified';
              item.decision.question = 'Which period applies?';
            }
          }
          return result;
        },
      },
    },
    new AbortController().signal,
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  assert.equal(detail?.run.status, 'needs_input');
  assert.equal(detail?.report?.findings.length, 2);
  assert.ok(
    detail.report.findings.every(
      (finding) => finding.status === 'unverified' && !finding.verified,
    ),
  );
  assert.equal(
    new Set(detail.report.findings.map((finding) => finding.comparisonId)).size,
    1,
  );
});

test('compact evidence retrieval is workspace scoped and refuses truncated large documents', async () => {
  const compact = await evidence.compactDocument(LOCAL_WORKSPACE_ID, policyId);
  assert.ok(compact?.length);
  assert.equal(await evidence.compactDocument(randomUUID(), policyId), null);
  assert.deepEqual(
    await evidence.neighbors(
      randomUUID(),
      compact.map((block) => block.id),
      [policyId],
    ),
    [],
  );
  assert.deepEqual(
    await evidence.neighbors(
      LOCAL_WORKSPACE_ID,
      compact.map((block) => block.id),
      [quoteId],
    ),
    [],
  );
  const id = compact[0]!.id;
  const original = compact[0]!.text;
  try {
    await pool.query('UPDATE evidence_blocks SET text=$2 WHERE id=$1', [
      id,
      'x'.repeat(16001),
    ]);
    assert.equal(
      await evidence.compactDocument(LOCAL_WORKSPACE_ID, policyId),
      null,
    );
  } finally {
    await pool.query('UPDATE evidence_blocks SET text=$2 WHERE id=$1', [
      id,
      original,
    ]);
  }
});

test('v4 rejects model-approved identical wording with unequal total limits and retains scope exclusions', async () => {
  const ids: string[] = [];
  for (const [index, amount] of ['INR 9,500,000', 'INR 10,000,000'].entries()) {
    const document = await documentRepository(pool).insertOrFind({
      id: randomUUID(),
      workspaceId: LOCAL_WORKSPACE_ID,
      filename: `dependency-${index}.pdf`,
      sha256: randomUUID().replaceAll('-', '').repeat(2),
      byteSize: 100,
      pageCount: 1,
      format: 'pdf',
      createdAt: new Date().toISOString(),
    });
    ids.push(document.id);
    const extraction = await evidence.claimExtraction();
    assert.ok(extraction);
    await evidence.complete(extraction, [
      {
        kind: 'pdf_page',
        label: 'Page 1',
        locator: { pageIndex: 0 },
        warnings: [],
        blocks: [
          'Fire up to total sum insured',
          'Total sum insured',
          amount,
          'Premium INR 100',
        ].map((text) => ({
          text,
          anchor: { kind: 'pdf' as const, pageIndex: 0, rectangles: [] },
        })),
      },
    ]);
  }
  const run = await reviews.create({
    workspaceId: LOCAL_WORKSPACE_ID,
    policyId: ids[0]!,
    quotationIds: [ids[1]!],
    task: 'Compare coverage limits in both directions.',
    reviewerModel: 'test-double',
    auditorModel: 'test-double',
  });
  const job = await reviews.claim();
  assert.ok(job);
  const base = createScriptedModel(ids[0]!, ids[1]!, evidence);
  await executeReview(
    job,
    {
      reviews,
      evidence,
      model: {
        async generate(role, instruction, raw, schema, signal, onProgress) {
          if (instruction.startsWith('Inventory every'))
            return {
              value: schema.parse({
                obligations: [
                  {
                    title: 'Fire effective limit',
                    category: 0,
                    sources: [0, 1, 2],
                    references: [],
                  },
                ],
                exclusions: [
                  {
                    sources: [3],
                    reason: 'Premium arithmetic outside agreed coverage scope',
                  },
                ],
              }),
              inputTokens: 10,
              outputTokens: 10,
              model: 'test-double',
            };
          return base.generate(
            role,
            instruction,
            raw,
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
  assert.equal(detail?.report?.findings.length, 2);
  assert.ok(
    detail.report.findings.every(
      (finding) =>
        !finding.verified &&
        finding.status === 'unverified' &&
        finding.verification.includes('total sums insured differ'),
    ),
  );
  assert.equal(detail.report.exclusions?.length, 2);
  assert.ok(
    detail.report.exclusions?.every((entry) =>
      entry.reason.includes('outside agreed coverage scope'),
    ),
  );
  assert.equal(detail.report.complete, false);
});
