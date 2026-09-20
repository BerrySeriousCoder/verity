import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  ReviewRun,
  ReviewScope,
  ReviewStatus,
  ReviewReport,
  ReviewDetail,
  ReviewEvent,
} from '@verity/core';

const columns = `id, workspace_id AS "workspaceId", policy_id AS "policyId", quotation_ids AS "quotationIds", task, roles_resolved AS "rolesResolved", messages, scope, status, phase, error, revision, answers, model_calls AS "modelCalls", input_tokens AS "inputTokens", output_tokens AS "outputTokens", reviewer_model AS "reviewerModel", auditor_model AS "auditorModel", created_at AS "createdAt", updated_at AS "updatedAt"`;
export interface ReviewJob {
  run: ReviewRun;
  leaseToken: string;
}

export function reviewRepository(pool: Pool) {
  return {
    async create(input: {
      workspaceId: string;
      policyId: string;
      inferRoles?: boolean;
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
        `WITH created AS (INSERT INTO review_runs(id,workspace_id,policy_id,quotation_ids,task,reviewer_model,auditor_model,roles_resolved) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *), event AS (INSERT INTO review_events(run_id,kind,title,data) SELECT id,'user','User message',jsonb_build_object('text',task) FROM created) SELECT ${columns} FROM created`,
        [
          randomUUID(),
          input.workspaceId,
          input.policyId,
          input.quotationIds,
          input.task,
          input.reviewerModel,
          input.auditorModel,
          !input.inferRoles,
        ],
      );
      return result.rows[0]!;
    },
    async events(
      workspaceId: string,
      runId: string,
      after = '0',
    ): Promise<ReviewEvent[]> {
      return (
        await pool.query<ReviewEvent>(
          `SELECT e.id::text,e.run_id AS "runId",e.kind,e.call_id AS "callId",e.title,e.data,e.created_at AS "createdAt" FROM review_events e JOIN review_runs r ON r.id=e.run_id WHERE r.workspace_id=$1 AND e.run_id=$2 AND e.id>$3::bigint ORDER BY e.id LIMIT 200`,
          [workspaceId, runId, after],
        )
      ).rows;
    },
    async emit(
      job: ReviewJob,
      kind: ReviewEvent['kind'],
      title: string,
      data: Record<string, unknown> = {},
      callId: string | null = null,
    ): Promise<void> {
      const encoded = JSON.stringify(data);
      const payload =
        encoded.length > 120000
          ? JSON.stringify({
              preview: encoded.slice(0, 110000),
              truncated: true,
            })
          : encoded;
      const result = await pool.query(
        `INSERT INTO review_events(run_id,kind,title,data,call_id) SELECT id,$3,$4,$5::jsonb,$6 FROM review_runs WHERE id=$1 AND lease_token=$2 AND status='running' FOR UPDATE RETURNING id`,
        [
          job.run.id,
          job.leaseToken,
          kind,
          title.slice(0, 500),
          payload,
          callId,
        ],
      );
      if (!result.rowCount) throw new Error('Review lease lost or cancelled.');
    },
    async assignRoles(
      job: ReviewJob,
      policyId: string,
      quotationIds: string[],
    ): Promise<void> {
      const original = [job.run.policyId, ...job.run.quotationIds];
      const selected = [policyId, ...quotationIds];
      if (
        new Set(selected).size !== original.length ||
        selected.length !== original.length ||
        selected.some((id) => !original.includes(id))
      )
        throw new Error(
          'Document roles must account for each attached document exactly once.',
        );
      const result = await pool.query(
        "UPDATE review_runs SET policy_id=$3,quotation_ids=$4,roles_resolved=true WHERE id=$1 AND lease_token=$2 AND status='running'",
        [job.run.id, job.leaseToken, policyId, quotationIds],
      );
      if (!result.rowCount) throw new Error('Review lease lost or cancelled.');
      job.run.policyId = policyId;
      job.run.quotationIds = quotationIds;
      job.run.rolesResolved = true;
    },
    async message(
      workspaceId: string,
      runId: string,
      text: string,
    ): Promise<boolean> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const row = (
          await client.query<{ status: ReviewStatus; revision: number }>(
            "SELECT status,revision FROM review_runs WHERE id=$1 AND workspace_id=$2 AND status IN ('needs_context','needs_scope','needs_input') FOR UPDATE",
            [runId, workspaceId],
          )
        ).rows[0];
        if (!row) {
          await client.query('ROLLBACK');
          return false;
        }
        const revision = row.revision + 1;
        const purpose =
          row.status === 'needs_context'
            ? 'context'
            : row.status === 'needs_scope'
              ? 'scope'
              : 'answers';
        await client.query(
          "UPDATE review_runs SET messages=messages || $2::jsonb,revision=$3,status='queued',attempts=0,error=NULL,updated_at=now() WHERE id=$1",
          [runId, JSON.stringify([{ text, purpose, revision }]), revision],
        );
        await client.query(
          "INSERT INTO review_events(run_id,kind,title,data) VALUES ($1,'user','User message',$2)",
          [runId, JSON.stringify({ text })],
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
    async applyAnswers(
      job: ReviewJob,
      answers: Record<string, string>,
    ): Promise<void> {
      const result = await pool.query(
        "UPDATE review_runs SET answers=answers || $3::jsonb WHERE id=$1 AND lease_token=$2 AND status='running'",
        [job.run.id, job.leaseToken, JSON.stringify(answers)],
      );
      if (!result.rowCount) throw new Error('Review lease lost or cancelled.');
      job.run.answers = { ...job.run.answers, ...answers };
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
        "UPDATE review_runs SET model_calls=model_calls+1 WHERE id=$1 AND lease_token=$2 AND status='running' RETURNING id",
        [job.run.id, job.leaseToken],
      );
      if (!result.rowCount)
        throw new Error('Review stopped or its execution lease was lost.');
    },
    async recordModelUsage(
      job: ReviewJob,
      usage: { inputTokens: number; outputTokens: number },
    ): Promise<void> {
      if (!usage.inputTokens && !usage.outputTokens) return;
      const result = await pool.query(
        "UPDATE review_runs SET input_tokens=input_tokens+$3,output_tokens=output_tokens+$4,updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='running'",
        [job.run.id, job.leaseToken, usage.inputTokens, usage.outputTokens],
      );
      if (!result.rowCount) throw new Error('Review lease lost or cancelled.');
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
      eventCallId = key,
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
        if (saved.rowCount && usage) {
          const encoded = JSON.stringify({
            output,
            role,
            model: usage?.model ?? null,
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
          });
          await client.query(
            'INSERT INTO review_events(run_id,kind,call_id,title,data) VALUES ($1,$2,$3,$4,$5)',
            [
              job.run.id,
              role === 'tool' ? 'tool_result' : 'step_result',
              eventCallId,
              role === 'tool' ? 'Tool completed' : 'Step completed',
              encoded.length > 120000
                ? JSON.stringify({
                    preview: encoded.slice(0, 110000),
                    truncated: true,
                  })
                : encoded,
            ],
          );
        }
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
        `WITH changed AS (UPDATE review_runs SET status=$3,phase=$4,scope=coalesce($5::jsonb,scope),report=coalesce($6::jsonb,report),error=$7,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' RETURNING id) INSERT INTO review_events(run_id,kind,title,data) SELECT id,'status',$4,jsonb_build_object('status',$3::text,'error',$7::text) FROM changed`,
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
              "UPDATE review_runs SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status IN ('queued','running','needs_context','needs_scope','needs_input')",
              [id, workspaceId],
            )
          : await pool.query(
              "UPDATE review_runs SET status='queued',attempts=0,error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status IN ('failed','cancelled')",
              [id, workspaceId],
            );
      return result.rowCount === 1;
    },
  };
}
export type ReviewRepository = ReturnType<typeof reviewRepository>;
