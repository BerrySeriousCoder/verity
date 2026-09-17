# First slice — immutable PDF upload and viewing

Status: Implemented for local development. This slice does not extract evidence or run reviews. See [ADR 0005](../decisions/0005-nextjs-tailwind-and-upload-slice.md).

## Contract

The local development workspace accepts one PDF per request, up to 20 MiB. Validate the PDF signature and structure, reject encrypted/malformed files, compute SHA-256 over original bytes, and preserve those bytes unchanged. A successful upload means stored and structurally readable, not extracted, digital-text verified, or reviewed. Scans are not interpreted; text-quality classification comes with ingestion.

Store metadata in PostgreSQL and original bytes through a local blob adapter. Each upload identity is immutable. Duplicate bytes within the workspace reuse the original record; matching filenames with different bytes create distinct records. Future logical-document revision grouping must be explicit rather than inferred from filenames.

## Data and ordering

`workspaces` owns `document_versions`. A document version stores ID, workspace ID, display filename, SHA-256, byte size, page count, and creation time. A unique `(workspace_id, sha256)` constraint handles concurrent duplicate uploads. No update/delete API is provided in this slice.

Write the blob atomically before inserting metadata. Blob keys are server-computed hashes, never user filenames. A failed database operation may leave an unreferenced blob; retain it because an ambiguous database commit might have succeeded. Future retention-aware garbage collection can reconcile orphans. Never delete a shared blob merely because one request failed.

Migration runner executes versioned SQL in transactions, uses an advisory lock to serialize migration sessions, and records checksums to reject edited historical migrations. Integration tests run in isolated PostgreSQL schemas, not SQLite.

## API

- `GET /api/health`: database readiness.
- `GET /api/workspace`: the single local development workspace.
- `GET /api/workspaces/:workspaceId/documents?limit=50&offset=0`: bounded, newest-first listing.
- `POST /api/workspaces/:workspaceId/documents`: one multipart file, no additional fields.
- `GET /api/workspaces/:workspaceId/documents/:documentId/file`: original bytes with PDF content type and private cache policy.

Validate UUIDs and pagination before SQL. Cross-workspace lookup returns not found. Validation errors have stable codes and readable messages; internal exceptions are logged without exposing internals to the browser.

This is a loopback-only, single-user development slice without authentication. It must refuse production mode and binding outside localhost. Restrict browser mutation origins. Workspace filtering is not user authorization; authentication and workspace membership must precede any shared deployment.

## UI

Next.js App Router and Tailwind utilities render the upload list and an original-PDF viewer using PDF.js. View one page at a time with previous/next, page input, and zoom controls. Cancel obsolete load/render tasks when selection changes, use a dedicated PDF worker, and keep errors visible and retryable. No chat/checklist placeholders imply an agent exists. The global CSS file contains only Tailwind's import.

Implementation: `project/packages/core/src/documents`, `project/packages/database/src`, `project/apps/api/src`, and `project/apps/web/src`. Engineering tests accompany the use case and HTTP/browser integration.

## Acceptance checks

Upload/list/read round-trip preserves exact bytes and hash; duplicates reuse identity; identical filenames with different bytes remain distinct; malformed/encrypted/oversized/multiple-file uploads fail; unknown workspace and cross-workspace reads fail. Failed blob publication prevents metadata insertion; metadata errors do not delete shared bytes because the commit outcome may be unknown. A browser smoke test uploads a generated digital PDF, renders a page, navigates pages, and reloads to verify persistence.

## Limitations

PDF structure validation is not content sanitization or malware scanning. Full-text extraction, source coordinates, citation highlights, range serving, document revision grouping, spreadsheet/CSV upload, authentication, and agent workflows are later slices. Rendering one page bounds canvas work but does not guarantee partial network transfer.
