import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  ReviewRun,
  ReviewScope,
  ReviewStatus,
  ReviewReport,
  ReviewDetail,
} from '@verity/core';

const columns = `id, workspace_id AS "workspaceId", policy_id AS "policyId", quotation_ids AS "quotationIds", task, scope, status, phase, error, revision, answers, model_calls AS "modelCalls", input_tokens AS "inputTokens", output_tokens AS "outputTokens", reviewer_model AS "reviewerModel", auditor_model AS "auditorModel", created_at AS "createdAt", updated_at AS "updatedAt"`;
export interface ReviewJob {
  run: ReviewRun;
  leaseToken: string;
}

export function reviewRepository(pool: Pool) {
  return {
    async create(input: {
      workspaceId: string;
      policyId: string;
      quotationIds: string[];
      task: string;
      reviewerModel: string;
      auditorModel: string;
    }): Promise<ReviewRun> {
      const ids = [input.policyId, ...input.quotationIds];
      if (new Set(ids).size !== ids.length || ids.length < 2)
        throw new Error('Choose distinct policy and quotation documents.');
      const existing = await pool.query<{ count: string }>(
        'SELECT count(*) FROM document_versions WHERE workspace_id=$1 AND id=ANY($2::uuid[])',
        [input.workspaceId, ids],
      );
      if (Number(existing.rows[0]?.count) !== ids.length)
        throw new Error(
          'A selected document is unavailable in this workspace.',
        );
      const result = await pool.query<ReviewRun>(
        `INSERT INTO review_runs(id,workspace_id,policy_id,quotation_ids,task,reviewer_model,auditor_model) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${columns}`,
        [
          randomUUID(),
          input.workspaceId,
          input.policyId,
          input.quotationIds,
          input.task,
          input.reviewerModel,
          input.auditorModel,
        ],
      );
      return result.rows[0]!;
    },
    async list(workspaceId: string): Promise<ReviewRun[]> {
      return (
        await pool.query<ReviewRun>(
          `SELECT ${columns} FROM review_runs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100`,
          [workspaceId],
        )
      ).rows;
    },
    async detail(
      workspaceId: string,
      id: string,
    ): Promise<ReviewDetail | null> {
      const run = (
        await pool.query<ReviewRun & { report: ReviewReport | null }>(
          `SELECT ${columns},report FROM review_runs WHERE id=$1 AND workspace_id=$2`,
          [id, workspaceId],
        )
      ).rows[0];
      if (!run) return null;
      const trace = await pool.query<ReviewDetail['trace'][number]>(
        `SELECT key,role,model,input_tokens AS "inputTokens",output_tokens AS "outputTokens",created_at AS "createdAt" FROM review_steps WHERE run_id=$1 ORDER BY created_at,key`,
        [id],
      );
      const { report, ...state } = run;
      return { run: state, report, trace: trace.rows };
    },
    async claim(): Promise<ReviewJob | null> {
      const leaseToken = randomUUID();
      await pool.query(
        "UPDATE review_runs SET status='failed',error='Worker recovery attempts exhausted.',updated_at=now() WHERE status='running' AND lease_until < now() AND attempts >= 3",
      );
      const result = await pool.query<ReviewRun>(
        `WITH candidate AS (SELECT id FROM review_runs WHERE (status='queued' OR (status='running' AND lease_until < now())) AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE review_runs SET status='running',lease_token=$1,lease_until=now()+interval '3 minutes',attempts=attempts+1,updated_at=now() WHERE id IN (SELECT id FROM candidate) RETURNING ${columns}`,
        [leaseToken],
      );
      return result.rows[0] ? { run: result.rows[0], leaseToken } : null;
    },
    async heartbeat(job: ReviewJob): Promise<boolean> {
      return (
        (
          await pool.query(
            "UPDATE review_runs SET lease_until=now()+interval '3 minutes' WHERE id=$1 AND lease_token=$2 AND status='running'",
            [job.run.id, job.leaseToken],
          )
        ).rowCount === 1
      );
    },
    async reserveCall(job: ReviewJob): Promise<void> {
      const result = await pool.query(
        "UPDATE review_runs SET model_calls=model_calls+1 WHERE id=$1 AND lease_token=$2 AND status='running' AND model_calls<1500 AND input_tokens+output_tokens<5000000 RETURNING id",
        [job.run.id, job.leaseToken],
      );
      if (!result.rowCount)
        throw new Error(
          'Review stopped or model budget exhausted (1,500 calls / 5 million tokens).',
        );
    },
    async loadStep<T>(runId: string, key: string): Promise<T | undefined> {
      return (
        await pool.query<{ output: T }>(
          'SELECT output FROM review_steps WHERE run_id=$1 AND key=$2',
          [runId, key],
        )
      ).rows[0]?.output;
    },
    async saveStep(
      job: ReviewJob,
      key: string,
      output: unknown,
      role: string,
      usage?: { model: string; inputTokens: number; outputTokens: number },
    ): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query(
          "SELECT id FROM review_runs WHERE id=$1 AND lease_token=$2 AND status='running' FOR UPDATE",
          [job.run.id, job.leaseToken],
        );
        if (!locked.rowCount)
          throw new Error('Review lease lost or cancelled.');
        const saved = await client.query(
          'INSERT INTO review_steps(run_id,key,output,role,model,input_tokens,output_tokens) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING key',
          [
            job.run.id,
            key,
            JSON.stringify(output),
            role,
            usage?.model ?? null,
            usage?.inputTokens ?? 0,
            usage?.outputTokens ?? 0,
          ],
        );
        if (saved.rowCount)
          await client.query(
            'UPDATE review_runs SET phase=$2,input_tokens=input_tokens+$3,output_tokens=output_tokens+$4,report=coalesce($5::jsonb,report),updated_at=now() WHERE id=$1',
            [
              job.run.id,
              key.startsWith('inventory/')
                ? 'Building source checklist'
                : key.startsWith('audit/')
                  ? 'Independently auditing source coverage'
                  : key.startsWith('reconcile/')
                    ? 'Combining independent checklists'
                    : key.startsWith('verify/')
                      ? 'Verifying findings against evidence'
                      : key.startsWith('scope')
                        ? 'Determining review scope'
                        : 'Comparing source obligations',
              usage?.inputTokens ?? 0,
              usage?.outputTokens ?? 0,
              key.startsWith('progress/') ? JSON.stringify(output) : null,
            ],
          );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async finish(
      job: ReviewJob,
      status: ReviewStatus,
      phase: string,
      values: {
        scope?: ReviewScope;
        report?: ReviewReport;
        error?: string;
      } = {},
    ): Promise<void> {
      const result = await pool.query(
        `UPDATE review_runs SET status=$3,phase=$4,scope=coalesce($5::jsonb,scope),report=coalesce($6::jsonb,report),error=$7,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='running'`,
        [
          job.run.id,
          job.leaseToken,
          status,
          phase,
          values.scope ? JSON.stringify(values.scope) : null,
          values.report ? JSON.stringify(values.report) : null,
          values.error ?? null,
        ],
      );
      if (!result.rowCount) throw new Error('Review lease lost or cancelled.');
    },
    async confirmScope(
      workspaceId: string,
      id: string,
      scope: ReviewScope,
    ): Promise<boolean> {
      return (
        (
          await pool.query(
            "UPDATE review_runs SET scope=$3,status='queued',attempts=0,error=NULL,updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status='needs_scope'",
            [id, workspaceId, JSON.stringify({ ...scope, confirmed: true })],
          )
        ).rowCount === 1
      );
    },
    async answer(
      workspaceId: string,
      id: string,
      answers: Record<string, string>,
    ): Promise<boolean> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query<{ report: ReviewReport }>(
          "SELECT report FROM review_runs WHERE id=$1 AND workspace_id=$2 AND status='needs_input' FOR UPDATE",
          [id, workspaceId],
        );
        const report = result.rows[0]?.report;
        if (!report) {
          await client.query('ROLLBACK');
          return false;
        }
        const pending = new Set(
          report.findings
            .filter((finding) => finding.question)
            .map((finding) => finding.id),
        );
        if (
          !Object.keys(answers).length ||
          Object.keys(answers).some((key) => !pending.has(key))
        )
          throw new Error(
            'Answer identifiers must refer to pending questions.',
          );
        await client.query(
          "UPDATE review_runs SET answers=answers || $2::jsonb,revision=revision+1,status='queued',attempts=0,error=NULL,updated_at=now() WHERE id=$1",
          [id, JSON.stringify(answers)],
        );
        await client.query('COMMIT');
        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async control(
      workspaceId: string,
      id: string,
      action: 'cancel' | 'retry',
    ): Promise<boolean> {
      const result =
        action === 'cancel'
          ? await pool.query(
              "UPDATE review_runs SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status IN ('queued','running','needs_scope','needs_input')",
              [id, workspaceId],
            )
          : await pool.query(
              "UPDATE review_runs SET status='queued',attempts=0,error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status IN ('failed','cancelled') AND model_calls<1500 AND input_tokens+output_tokens<5000000",
              [id, workspaceId],
            );
      return result.rowCount === 1;
    },
  };
}
export type ReviewRepository = ReturnType<typeof reviewRepository>;
