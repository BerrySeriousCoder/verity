import type { FastifyInstance } from 'fastify';
import type { EvidenceRepository } from '@verity/database';

const uuid = { type: 'string', format: 'uuid' } as const;

export function registerEvidenceRoutes(
  app: FastifyInstance,
  evidence: EvidenceRepository,
) {
  app.get<{ Params: { workspaceId: string; documentId: string } }>(
    '/api/workspaces/:workspaceId/documents/:documentId/extraction',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId', 'documentId'],
          properties: { workspaceId: uuid, documentId: uuid },
        },
      },
    },
    async (request, reply) => {
      const extraction = await evidence.inspect(
        request.params.workspaceId,
        request.params.documentId,
      );
      return (
        extraction ??
        reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: 'Extraction not found.' })
      );
    },
  );

  app.post<{ Params: { workspaceId: string; documentId: string } }>(
    '/api/workspaces/:workspaceId/documents/:documentId/extraction/retry',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId', 'documentId'],
          properties: { workspaceId: uuid, documentId: uuid },
        },
      },
    },
    async (request, reply) => {
      const retried = await evidence.retry(
        request.params.workspaceId,
        request.params.documentId,
      );
      return retried
        ? { queued: true }
        : reply.code(409).send({
            code: 'NOT_RETRYABLE',
            message: 'Only failed extractions can be retried.',
          });
    },
  );

  app.get<{
    Params: { workspaceId: string; unitId: string };
    Querystring: { offset?: number; limit?: number };
  }>(
    '/api/workspaces/:workspaceId/units/:unitId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId', 'unitId'],
          properties: { workspaceId: uuid, unitId: uuid },
        },
        querystring: {
          type: 'object',
          properties: {
            offset: {
              type: 'integer',
              minimum: 0,
              maximum: 100000,
              default: 0,
            },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
          },
        },
      },
    },
    async (request) => {
      const limit = request.query.limit ?? 100;
      const blocks = await evidence.blocks(
        request.params.workspaceId,
        request.params.unitId,
        request.query.offset ?? 0,
        limit + 1,
      );
      return { blocks: blocks.slice(0, limit), hasMore: blocks.length > limit };
    },
  );

  app.get<{ Params: { workspaceId: string; evidenceId: string } }>(
    '/api/workspaces/:workspaceId/evidence/:evidenceId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId', 'evidenceId'],
          properties: { workspaceId: uuid, evidenceId: uuid },
        },
      },
    },
    async (request, reply) => {
      const resolved = await evidence.resolve(request.params.workspaceId, [
        request.params.evidenceId,
      ]);
      return (
        resolved[0] ??
        reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: 'Evidence not found.' })
      );
    },
  );

  app.get<{
    Params: { workspaceId: string };
    Querystring: { documentId: string; q: string; offset?: number };
  }>(
    '/api/workspaces/:workspaceId/search',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId'],
          properties: { workspaceId: uuid },
        },
        querystring: {
          type: 'object',
          required: ['documentId', 'q'],
          properties: {
            documentId: uuid,
            q: { type: 'string', minLength: 1, maxLength: 300 },
            offset: {
              type: 'integer',
              minimum: 0,
              maximum: 100000,
              default: 0,
            },
          },
        },
      },
    },
    async (request) => {
      const blocks = await evidence.search(
        request.params.workspaceId,
        [request.query.documentId],
        request.query.q,
        request.query.offset ?? 0,
        21,
      );
      return { blocks: blocks.slice(0, 20), hasMore: blocks.length > 20 };
    },
  );
}
