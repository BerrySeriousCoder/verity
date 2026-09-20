import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  DocumentFormat,
  EvidenceBlock,
  EvidenceUnit,
  ExtractionSummary,
  ParsedUnit,
  ResolvedEvidence,
} from '@verity/core';

export interface ExtractionJob {
  id: string;
  documentId: string;
  sha256: string;
  format: DocumentFormat;
  leaseToken: string;
}

const unitColumns = `u.id, u.extraction_id AS "extractionId", u.ordinal, u.label, u.kind, u.locator, u.warnings`;
const blockColumns = `b.id, b.unit_id AS "unitId", b.ordinal, b.text, b.anchor`;

export function evidenceRepository(pool: Pool) {
  return {
    async claimExtraction(): Promise<ExtractionJob | null> {
      const leaseToken = randomUUID();
      const result = await pool.query<ExtractionJob>(
        `WITH candidate AS (
        SELECT id FROM document_extractions WHERE (status='queued' OR (status='running' AND lease_until < now()))
        AND attempts < 3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      ), claimed AS (
        UPDATE document_extractions e SET status='running', lease_token=$1, lease_until=now()+interval '2 minutes', attempts=attempts+1
        FROM candidate c WHERE e.id=c.id RETURNING e.*
      ) SELECT c.id, c.document_id AS "documentId", d.sha256, d.format, c.lease_token AS "leaseToken"
      FROM claimed c JOIN document_versions d ON d.id=c.document_id`,
        [leaseToken],
      );
      await pool.query(
        "UPDATE document_extractions SET status='failed', error='Processing attempts exhausted after worker interruption.' WHERE status='running' AND lease_until < now() AND attempts >= 3",
      );
      return result.rows[0] ?? null;
    },
    async heartbeat(job: ExtractionJob) {
      const result = await pool.query(
        "UPDATE document_extractions SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND lease_token=$2 AND status='running'",
        [job.id, job.leaseToken],
      );
      return result.rowCount === 1;
    },
    async complete(job: ExtractionJob, units: ParsedUnit[]) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const claimed = await client.query(
          "UPDATE document_extractions SET status='ready', completed_at=now(), lease_until=NULL, error=NULL, warnings=$3 WHERE id=$1 AND lease_token=$2 AND status='running' RETURNING id",
          [
            job.id,
            job.leaseToken,
            JSON.stringify([
              ...new Set(units.flatMap((unit) => unit.warnings)),
            ]),
          ],
        );
        if (!claimed.rowCount) throw new Error('Extraction lease lost.');
        for (const [ordinal, unit] of units.entries()) {
          const unitId = randomUUID();
          await client.query(
            'INSERT INTO evidence_units (id, extraction_id, ordinal, label, kind, locator, warnings) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [
              unitId,
              job.id,
              ordinal,
              unit.label,
              unit.kind,
              JSON.stringify(unit.locator),
              JSON.stringify(unit.warnings),
            ],
          );
          for (const [blockOrdinal, block] of unit.blocks.entries()) {
            await client.query(
              'INSERT INTO evidence_blocks (id, unit_id, ordinal, text, anchor) VALUES ($1,$2,$3,$4,$5)',
              [
                randomUUID(),
                unitId,
                blockOrdinal,
                block.text,
                JSON.stringify(block.anchor),
              ],
            );
          }
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async fail(job: ExtractionJob, error: string) {
      await pool.query(
        "UPDATE document_extractions SET status='failed', error=$3, lease_until=NULL WHERE id=$1 AND lease_token=$2 AND status='running'",
        [job.id, job.leaseToken, error.slice(0, 1000)],
      );
    },
    async inspect(
      workspaceId: string,
      documentId: string,
    ): Promise<ExtractionSummary | null> {
      const result = await pool.query<Omit<ExtractionSummary, 'units'>>(
        `SELECT e.id, d.filename, e.document_id AS "documentId", e.status, e.error, e.warnings, e.parser_version AS "parserVersion"
        FROM document_extractions e JOIN document_versions d ON d.id=e.document_id WHERE d.id=$1 AND d.workspace_id=$2`,
        [documentId, workspaceId],
      );
      const extraction = result.rows[0];
      if (!extraction) return null;
      const units = await pool.query<EvidenceUnit>(
        `SELECT ${unitColumns} FROM evidence_units u WHERE u.extraction_id=$1 ORDER BY u.ordinal`,
        [extraction.id],
      );
      return { ...extraction, units: units.rows };
    },
    async blocks(
      workspaceId: string,
      unitId: string,
      offset = 0,
      limit = 100,
    ): Promise<EvidenceBlock[]> {
      const result = await pool.query<EvidenceBlock>(
        `SELECT ${blockColumns} FROM evidence_blocks b
        JOIN evidence_units u ON u.id=b.unit_id JOIN document_extractions e ON e.id=u.extraction_id
        JOIN document_versions d ON d.id=e.document_id WHERE b.unit_id=$1 AND d.workspace_id=$2 ORDER BY b.ordinal LIMIT $3 OFFSET $4`,
        [unitId, workspaceId, limit, offset],
      );
      return result.rows;
    },
    async resolve(
      workspaceId: string,
      ids: string[],
      documentIds?: string[],
    ): Promise<ResolvedEvidence[]> {
      if (!ids.length) return [];
      const result = await pool.query<ResolvedEvidence>(
        `SELECT ${blockColumns}, d.id AS "documentId", d.filename, e.id AS "extractionId", u.label
        FROM evidence_blocks b JOIN evidence_units u ON u.id=b.unit_id JOIN document_extractions e ON e.id=u.extraction_id
        JOIN document_versions d ON d.id=e.document_id WHERE b.id=ANY($1::uuid[]) AND d.workspace_id=$2 AND ($3::uuid[] IS NULL OR d.id=ANY($3::uuid[]))`,
        [ids, workspaceId, documentIds ?? null],
      );
      return result.rows;
    },
    async search(
      workspaceId: string,
      documentIds: string[],
      query: string,
      offset = 0,
      limit = 20,
    ): Promise<ResolvedEvidence[]> {
      const result = await pool.query<ResolvedEvidence>(
        `SELECT ${blockColumns}, d.id AS "documentId", d.filename, e.id AS "extractionId", u.label
        FROM evidence_blocks b JOIN evidence_units u ON u.id=b.unit_id JOIN document_extractions e ON e.id=u.extraction_id
        JOIN document_versions d ON d.id=e.document_id WHERE d.workspace_id=$1 AND d.id=ANY($2::uuid[])
        AND (b.search_vector @@ websearch_to_tsquery('simple', $3) OR strpos(lower(b.text),lower($3))>0)
        ORDER BY ts_rank(b.search_vector, websearch_to_tsquery('simple',$3)) DESC, d.id, u.ordinal, b.ordinal LIMIT $4 OFFSET $5`,
        [workspaceId, documentIds, query, limit, offset],
      );
      return result.rows;
    },
    async retry(workspaceId: string, documentId: string) {
      const result = await pool.query(
        `UPDATE document_extractions e SET status='queued', attempts=0, error=NULL, lease_token=NULL, lease_until=NULL
        FROM document_versions d WHERE e.document_id=d.id AND d.id=$1 AND d.workspace_id=$2 AND e.status='failed' RETURNING e.id`,
        [documentId, workspaceId],
      );
      return result.rowCount === 1;
    },
  };
}

export type EvidenceRepository = ReturnType<typeof evidenceRepository>;
