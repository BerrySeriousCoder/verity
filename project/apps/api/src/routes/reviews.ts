import type { FastifyInstance } from 'fastify';
import type { ReviewRepository, EvidenceRepository } from '@verity/database';
import type { ReviewScope } from '@verity/core';

const uuid = { type: 'string', format: 'uuid' } as const;
const params = {
  type: 'object',
  required: ['workspaceId', 'runId'],
  properties: { workspaceId: uuid, runId: uuid },
} as const;
type RunParams = { workspaceId: string; runId: string };

export function registerReviewRoutes(
  app: FastifyInstance,
  reviews: ReviewRepository,
  evidence: EvidenceRepository,
) {
  app.get('/api/model-status', async () => ({
    provider: 'gemini',
    configured: Boolean(process.env['GEMINI_API_KEY']),
    reviewerModel: process.env['GEMINI_MODEL'] || 'gemini-3.8-flash',
    auditorModel:
      process.env['GEMINI_AUDITOR_MODEL'] ||
      process.env['GEMINI_MODEL'] ||
      'gemini-3.8-flash',
  }));
  app.get<{ Params: { workspaceId: string } }>(
    '/api/workspaces/:workspaceId/reviews',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId'],
          properties: { workspaceId: uuid },
        },
      },
    },
    async (request) => ({
      runs: await reviews.list(request.params.workspaceId),
    }),
  );
  app.post<{
    Params: { workspaceId: string };
    Body: { policyId: string; quotationIds: string[]; task: string };
  }>(
    '/api/workspaces/:workspaceId/reviews',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workspaceId'],
          properties: { workspaceId: uuid },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['policyId', 'quotationIds', 'task'],
          properties: {
            policyId: uuid,
            quotationIds: {
              type: 'array',
              minItems: 1,
              maxItems: 30,
              uniqueItems: true,
              items: uuid,
            },
            task: { type: 'string', minLength: 5, maxLength: 5000 },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      if (!process.env['GEMINI_API_KEY'])
        return reply.code(503).send({
          message:
            'Gemini is not configured. Set GEMINI_API_KEY in project/.env and restart the app.',
        });
      for (const id of [request.body.policyId, ...request.body.quotationIds]) {
        if ((await evidence.inspect(workspaceId, id))?.status !== 'ready')
          return reply.code(409).send({
            message:
              'All selected documents must finish extraction before starting a review.',
          });
      }
      if (request.body.quotationIds.includes(request.body.policyId))
        return reply.code(400).send({
          message: 'Policy and quotation must be different documents.',
        });
      const run = await reviews.create({
        workspaceId,
        ...request.body,
        reviewerModel: process.env['GEMINI_MODEL'] || 'gemini-3.8-flash',
        auditorModel:
          process.env['GEMINI_AUDITOR_MODEL'] ||
          process.env['GEMINI_MODEL'] ||
          'gemini-3.8-flash',
      });
      return reply.code(201).send({ run });
    },
  );
  app.get<{ Params: RunParams }>(
    '/api/workspaces/:workspaceId/reviews/:runId',
    { schema: { params } },
    async (request, reply) =>
      (await reviews.detail(
        request.params.workspaceId,
        request.params.runId,
      )) ?? reply.code(404).send({ message: 'Review not found.' }),
  );
  app.post<{ Params: RunParams; Body: ReviewScope }>(
    '/api/workspaces/:workspaceId/reviews/:runId/scope',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'categories'],
          properties: {
            description: { type: 'string', minLength: 5, maxLength: 2000 },
            categories: {
              type: 'array',
              minItems: 1,
              maxItems: 30,
              items: { type: 'string', minLength: 1, maxLength: 100 },
            },
            confirmed: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) =>
      (await reviews.confirmScope(
        request.params.workspaceId,
        request.params.runId,
        request.body,
      ))
        ? { queued: true }
        : reply
            .code(409)
            .send({ message: 'Review is not waiting for scope confirmation.' }),
  );
  app.post<{ Params: RunParams; Body: { answers: Record<string, string> } }>(
    '/api/workspaces/:workspaceId/reviews/:runId/answers',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['answers'],
          properties: {
            answers: {
              type: 'object',
              minProperties: 1,
              maxProperties: 100,
              additionalProperties: {
                type: 'string',
                minLength: 1,
                maxLength: 3000,
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return (await reviews.answer(
          request.params.workspaceId,
          request.params.runId,
          request.body.answers,
        ))
          ? { queued: true }
          : reply
              .code(409)
              .send({ message: 'Review is not waiting for answers.' });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith('Answer identifiers')
        )
          return reply.code(400).send({ message: error.message });
        throw error;
      }
    },
  );
  for (const action of ['cancel', 'retry'] as const)
    app.post<{ Params: RunParams }>(
      `/api/workspaces/:workspaceId/reviews/:runId/${action}`,
      { schema: { params } },
      async (request, reply) =>
        (await reviews.control(
          request.params.workspaceId,
          request.params.runId,
          action,
        ))
          ? { updated: true }
          : reply.code(409).send({
              message: `This review cannot ${action} in its current state or has exhausted its model budget.`,
            }),
    );
  app.get<{ Params: RunParams }>(
    '/api/workspaces/:workspaceId/reviews/:runId/report',
    { schema: { params } },
    async (request, reply) => {
      const detail = await reviews.detail(
        request.params.workspaceId,
        request.params.runId,
      );
      if (!detail?.report)
        return reply
          .code(404)
          .send({ message: 'Report is not available yet.' });
      return reply
        .header(
          'Content-Disposition',
          'attachment; filename="verity-review.json"',
        )
        .send({
          task: detail.run.task,
          scope: detail.run.scope,
          documents: {
            policy: detail.run.policyId,
            quotations: detail.run.quotationIds,
          },
          report: detail.report,
          citations: await evidence.resolve(
            request.params.workspaceId,
            [
              ...new Set(
                detail.report.findings.flatMap(
                  (finding) => finding.evidenceIds,
                ),
              ),
            ],
            [detail.run.policyId, ...detail.run.quotationIds],
          ),
          models: {
            reviewer: detail.run.reviewerModel,
            auditor: detail.run.auditorModel,
          },
        });
    },
  );
}
