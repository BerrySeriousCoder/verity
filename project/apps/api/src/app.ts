import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import {
  createDocumentService,
  DocumentError,
  MAX_PDF_BYTES,
} from '@verity/core';
import type { BlobStore, DocumentRepository, PdfInspector } from '@verity/core';

interface AppDependencies {
  repository: DocumentRepository;
  blobs: BlobStore;
  inspector: PdfInspector;
  workspaceId: string;
  ready: () => Promise<void>;
  logger?: boolean;
}

const uuid = { type: 'string', format: 'uuid' } as const;
const workspaceParams = {
  type: 'object',
  required: ['workspaceId'],
  additionalProperties: false,
  properties: { workspaceId: uuid },
} as const;

export async function buildApp(dependencies: AppDependencies) {
  const app = Fastify({
    logger: dependencies.logger ?? false,
    requestTimeout: 60_000,
    bodyLimit: MAX_PDF_BYTES,
  });
  const service = createDocumentService(dependencies);
  await app.register(multipart, {
    limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 0, parts: 1 },
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    if (!['localhost', '127.0.0.1'].includes(request.hostname)) {
      return reply.code(403).send({
        code: 'FORBIDDEN_HOST',
        message: 'This development server only accepts localhost requests.',
      });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const origin = request.headers.origin;
      if (
        request.headers['sec-fetch-site'] === 'cross-site' ||
        (origin !== undefined &&
          ![
            'http://127.0.0.1:3000',
            'http://localhost:3000',
            'http://127.0.0.1:3001',
            'http://localhost:3001',
          ].includes(origin))
      ) {
        return reply.code(403).send({
          code: 'FORBIDDEN_ORIGIN',
          message: 'Request origin is not allowed.',
        });
      }
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DocumentError) {
      const status =
        error.code === 'WORKSPACE_NOT_FOUND'
          ? 404
          : error.code === 'FILE_TOO_LARGE'
            ? 413
            : 422;
      return reply
        .code(status)
        .send({ code: error.code, message: error.message });
    }
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      return reply.code(413).send({
        code: 'FILE_TOO_LARGE',
        message: 'PDF must be 20 MiB or smaller.',
      });
    }
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      [
        'ERR_STREAM_PREMATURE_CLOSE',
        'FST_PARTS_LIMIT',
        'FST_FILES_LIMIT',
        'FST_FIELDS_LIMIT',
      ].includes(error.code)
    ) {
      // Multipart limits can close a file stream before the parser's limit
      // error reaches its iterator. This is invalid input, not a server fault.
      return reply.code(400).send({
        code: 'INVALID_UPLOAD',
        message:
          'Invalid or incomplete upload. Send exactly one PDF file without extra fields.',
      });
    }
    if (error instanceof Error && 'validation' in error) {
      return reply.code(400).send({
        code: 'INVALID_REQUEST',
        message: 'Invalid document identifier or pagination parameters.',
      });
    }
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      return reply.code(error.statusCode).send({
        code: 'INVALID_REQUEST',
        message:
          'Invalid request. Upload exactly one PDF (up to 20 MiB), without extra fields.',
      });
    }
    request.log.error({ err: error }, 'Request failed');
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed. Please retry.',
    });
  });

  app.get('/api/health', async (_request, reply) => {
    try {
      await dependencies.ready();
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/api/workspace', async () => ({
    id: dependencies.workspaceId,
    name: 'My review workspace',
  }));

  app.get<{
    Params: { workspaceId: string };
    Querystring: { limit?: number; offset?: number };
  }>(
    '/api/workspaces/:workspaceId/documents',
    {
      schema: {
        params: workspaceParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            offset: {
              type: 'integer',
              minimum: 0,
              maximum: 1_000_000,
              default: 0,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      if (!(await dependencies.repository.workspaceExists(workspaceId)))
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: 'Workspace not found.' });
      const limit = request.query.limit ?? 50;
      const documents = await dependencies.repository.list(
        workspaceId,
        limit + 1,
        request.query.offset ?? 0,
      );
      return {
        documents: documents.slice(0, limit),
        hasMore: documents.length > limit,
      };
    },
  );

  app.post<{ Params: { workspaceId: string } }>(
    '/api/workspaces/:workspaceId/documents',
    { schema: { params: workspaceParams } },
    async (request, reply) => {
      let upload: { filename: string; bytes: Buffer } | undefined;
      // Consume the entire multipart request before any persistence, so a
      // second file or unexpected field cannot leave a successful upload behind.
      for await (const part of request.parts()) {
        if (part.type !== 'file')
          return reply.code(400).send({
            code: 'INVALID_REQUEST',
            message: 'Upload exactly one PDF file.',
          });
        upload = { filename: part.filename, bytes: await part.toBuffer() };
      }
      if (!upload)
        return reply
          .code(400)
          .send({ code: 'FILE_REQUIRED', message: 'Choose a PDF to upload.' });
      const document = await service.upload(
        request.params.workspaceId,
        upload.filename,
        upload.bytes,
      );
      // Upsert semantics: identical bytes return the existing immutable record.
      return reply.code(200).send({ document });
    },
  );

  app.get<{ Params: { workspaceId: string; documentId: string } }>(
    '/api/workspaces/:workspaceId/documents/:documentId/file',
    {
      schema: {
        params: {
          ...workspaceParams,
          required: ['workspaceId', 'documentId'],
          properties: { workspaceId: uuid, documentId: uuid },
        },
      },
    },
    async (request, reply) => {
      const document = await dependencies.repository.find(
        request.params.workspaceId,
        request.params.documentId,
      );
      if (!document)
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: 'Document not found.' });
      const bytes = await dependencies.blobs.read(document.sha256);
      return reply
        .type('application/pdf')
        .header('Content-Disposition', 'inline; filename="document.pdf"')
        .header('Content-Security-Policy', "sandbox; default-src 'none'")
        .header('Content-Length', bytes.byteLength)
        .send(Buffer.from(bytes));
    },
  );
  return app;
}
