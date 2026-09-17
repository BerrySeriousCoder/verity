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
import { executeReview, geminiModel } from '@verity/agent';
import { extractDocument } from '@verity/ingestion';
import { PDFDocument } from 'pdf-lib';
import { createHash } from 'node:crypto';

const key = process.env['GEMINI_API_KEY'];
if (!key)
  throw new Error(
    'Set GEMINI_API_KEY in project/.env before running the live review smoke test.',
  );
const schema = `live_smoke_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString: databaseUrl() });
const pool = new Pool({
  connectionString: databaseUrl(),
  options: `-c search_path=${schema}`,
});
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await ensureLocalWorkspace(pool);
  const documents = documentRepository(pool),
    evidence = evidenceRepository(pool),
    reviews = reviewRepository(pool);
  const pdf = await PDFDocument.create();
  pdf.addPage([560, 720]).drawText('Policy: flood extension limit USD 1250.', {
    x: 40,
    y: 650,
    size: 14,
  });
  const fixtures = [
    { filename: 'policy.pdf', format: 'pdf' as const, bytes: await pdf.save() },
    {
      filename: 'quotation.csv',
      format: 'csv' as const,
      bytes: new TextEncoder().encode(
        'Coverage,Limit,Currency\nFlood extension,1500,USD',
      ),
    },
  ];
  const ids: string[] = [];
  for (const fixture of fixtures) {
    const document = await documents.insertOrFind({
      id: randomUUID(),
      workspaceId: LOCAL_WORKSPACE_ID,
      filename: fixture.filename,
      format: fixture.format,
      sha256: createHash('sha256').update(fixture.bytes).digest('hex'),
      byteSize: fixture.bytes.length,
      pageCount: 1,
      createdAt: new Date().toISOString(),
    });
    ids.push(document.id);
    const job = await evidence.claimExtraction();
    if (!job) throw new Error('Smoke extraction was not queued.');
    await evidence.complete(
      job,
      await extractDocument(fixture.bytes, fixture.format),
    );
  }
  const reviewer = process.env['GEMINI_MODEL'] || 'gemini-3.8-flash';
  const auditor = process.env['GEMINI_AUDITOR_MODEL'] || reviewer;
  const run = await reviews.create({
    workspaceId: LOCAL_WORKSPACE_ID,
    policyId: ids[0]!,
    quotationIds: [ids[1]!],
    task: 'Compare only the stated flood extension limit and currency in both directions. Report differences. Do not check other coverages, dates, or terms.',
    reviewerModel: reviewer,
    auditorModel: auditor,
  });
  const job = await reviews.claim();
  if (!job) throw new Error('Smoke review was not queued.');
  await executeReview(
    job,
    { reviews, evidence, model: geminiModel(key, reviewer, auditor) },
    AbortSignal.timeout(10 * 60 * 1000),
  );
  const detail = await reviews.detail(LOCAL_WORKSPACE_ID, run.id);
  console.info(
    JSON.stringify(
      {
        status: detail?.run.status,
        modelCalls: detail?.run.modelCalls,
        inputTokens: detail?.run.inputTokens,
        outputTokens: detail?.run.outputTokens,
        report: detail?.report,
      },
      null,
      2,
    ),
  );
  if (
    !detail?.report?.complete ||
    !detail.report.findings.some(
      (finding) => finding.status === 'different' && finding.verified,
    )
  )
    throw new Error(
      'Live smoke test did not produce a complete, verified limit discrepancy. Inspect the result; do not report this test as passing.',
    );
} finally {
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
