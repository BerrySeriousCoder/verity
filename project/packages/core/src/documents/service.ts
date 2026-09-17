import { createHash, randomUUID } from 'node:crypto';
import { DocumentError, MAX_PDF_BYTES } from './types.js';
import type { BlobStore, DocumentRepository, PdfInspector } from './types.js';

export function createDocumentService(dependencies: {
  repository: DocumentRepository;
  blobs: BlobStore;
  inspector: PdfInspector;
}) {
  const { repository, blobs, inspector } = dependencies;

  return {
    async upload(workspaceId: string, filename: string, bytes: Uint8Array) {
      if (!(await repository.workspaceExists(workspaceId))) {
        throw new DocumentError('WORKSPACE_NOT_FOUND', 'Workspace not found.');
      }
      if (bytes.byteLength > MAX_PDF_BYTES) {
        throw new DocumentError(
          'FILE_TOO_LARGE',
          'PDF must be 20 MiB or smaller.',
        );
      }
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
        throw new DocumentError('INVALID_PDF', 'Choose a valid PDF file.');
      }

      const { pageCount } = await inspector.inspect(bytes);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      // Names are display metadata only. They never enter a filesystem path.
      const displayName = filename
        .split(/[\\/]/)
        .at(-1)
        ?.replace(/[\u0000-\u001f\u007f]/g, '')
        .trim();
      await blobs.put(sha256, bytes);
      // Do not delete the blob on a database error: it may be shared, or the
      // commit outcome may be unknown after a connection failure.
      return repository.insertOrFind({
        id: randomUUID(),
        workspaceId,
        filename: (displayName || 'document.pdf').slice(0, 255),
        sha256,
        byteSize: bytes.byteLength,
        pageCount,
        createdAt: new Date().toISOString(),
      });
    },
  };
}
