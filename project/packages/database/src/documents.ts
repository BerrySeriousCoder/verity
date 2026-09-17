import type { DocumentRepository, DocumentVersion } from '@verity/core';
import type { Pool } from 'pg';

interface DocumentRow {
  id: string;
  workspace_id: string;
  filename: string;
  sha256: string;
  byte_size: number;
  page_count: number;
  created_at: Date;
}

function toDocument(row: DocumentRow): DocumentVersion {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    filename: row.filename,
    sha256: row.sha256,
    byteSize: row.byte_size,
    pageCount: row.page_count,
    createdAt: row.created_at.toISOString(),
  };
}

export function documentRepository(pool: Pool): DocumentRepository {
  return {
    async workspaceExists(id) {
      const result = await pool.query(
        'SELECT 1 FROM workspaces WHERE id = $1',
        [id],
      );
      return result.rowCount === 1;
    },
    async insertOrFind(document) {
      const inserted = await pool.query<DocumentRow>(
        `INSERT INTO document_versions
        (id, workspace_id, filename, sha256, byte_size, page_count, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (workspace_id, sha256) DO NOTHING RETURNING *`,
        [
          document.id,
          document.workspaceId,
          document.filename,
          document.sha256,
          document.byteSize,
          document.pageCount,
          document.createdAt,
        ],
      );
      if (inserted.rows[0]) return toDocument(inserted.rows[0]);
      // A separate statement sees the committed winner of a concurrent insert.
      const existing = await pool.query<DocumentRow>(
        'SELECT * FROM document_versions WHERE workspace_id = $1 AND sha256 = $2',
        [document.workspaceId, document.sha256],
      );
      if (!existing.rows[0])
        throw new Error('Duplicate document could not be resolved.');
      return toDocument(existing.rows[0]);
    },
    async find(workspaceId, documentId) {
      const result = await pool.query<DocumentRow>(
        'SELECT * FROM document_versions WHERE workspace_id = $1 AND id = $2',
        [workspaceId, documentId],
      );
      return result.rows[0] ? toDocument(result.rows[0]) : null;
    },
    async list(workspaceId, limit, offset) {
      const result = await pool.query<DocumentRow>(
        'SELECT * FROM document_versions WHERE workspace_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3',
        [workspaceId, limit, offset],
      );
      return result.rows.map(toDocument);
    },
  };
}
