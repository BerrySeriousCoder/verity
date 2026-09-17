export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export interface DocumentVersion {
  id: string;
  workspaceId: string;
  filename: string;
  sha256: string;
  byteSize: number;
  pageCount: number;
  createdAt: string;
  format: 'pdf' | 'csv' | 'xlsx';
}

export interface DocumentRepository {
  workspaceExists(workspaceId: string): Promise<boolean>;
  insertOrFind(document: DocumentVersion): Promise<DocumentVersion>;
  find(
    workspaceId: string,
    documentId: string,
  ): Promise<DocumentVersion | null>;
  list(
    workspaceId: string,
    limit: number,
    offset: number,
  ): Promise<DocumentVersion[]>;
}

export interface BlobStore {
  put(sha256: string, bytes: Uint8Array): Promise<void>;
  read(sha256: string): Promise<Uint8Array>;
}

export interface PdfInspector {
  inspect(
    bytes: Uint8Array,
    format?: 'pdf' | 'csv' | 'xlsx',
  ): Promise<{ pageCount: number }>;
}

export class DocumentError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PDF'
      | 'INVALID_DOCUMENT'
      | 'FILE_TOO_LARGE'
      | 'WORKSPACE_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'DocumentError';
  }
}
