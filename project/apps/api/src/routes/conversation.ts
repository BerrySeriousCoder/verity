import type { FastifyInstance } from 'fastify';
import type { EvidenceRepository, ReviewRepository } from '@verity/database';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';

const uuid = { type: 'string', format: 'uuid' } as const;
const params = {
  type: 'object',
  required: ['workspaceId', 'runId'],
  properties: { workspaceId: uuid, runId: uuid },
} as const;
type Params = { workspaceId: string; runId: string };

export function registerConversationRoutes(
  app: FastifyInstance,
  reviews: ReviewRepository,
  evidence: EvidenceRepository,
) {
  app.post<{
    Params: { workspaceId: string };
    Body: { task: string; documentIds: string[] };
  }>(
    '/api/workspaces/:workspaceId/conversations',
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
          required: ['task', 'documentIds'],
          properties: {
            task: { type: 'string', minLength: 5, maxLength: 5000 },
            documentIds: {
              type: 'array',
              items: uuid,
              uniqueItems: true,
              minItems: 2,
              maxItems: 31,
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!process.env['GEMINI_API_KEY'])
        return reply.code(503).send({
          message:
            'Gemini is not configured. Add GEMINI_API_KEY to the local .env and restart the app.',
        });
      for (const id of request.body.documentIds) {
        const source = await evidence.inspect(request.params.workspaceId, id);
        if (!source)
          return reply.code(404).send({
            message: 'An attached document is not available in this workspace.',
          });
        if (source.status === 'failed')
          return reply.code(409).send({
            message:
              'An attached file could not be extracted. Retry its extraction before submitting.',
          });
      }
      const [first, ...remaining] = request.body.documentIds;
      // Storage placeholder only. No review starts until the model resolves roles
      // from the user's message and validates them against these pinned files.
      const run = await reviews.create({
        workspaceId: request.params.workspaceId,
        policyId: first!,
        quotationIds: remaining,
        inferRoles: true,
        task: request.body.task,
        reviewerModel: process.env['GEMINI_MODEL'] || 'gemini-3.8-flash',
        auditorModel:
          process.env['GEMINI_AUDITOR_MODEL'] ||
          process.env['GEMINI_MODEL'] ||
          'gemini-3.8-flash',
      });
      return reply.code(201).send({ run });
    },
  );
  app.post<{ Params: Params; Body: { text: string } }>(
    '/api/workspaces/:workspaceId/reviews/:runId/messages',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['text'],
          properties: {
            text: { type: 'string', minLength: 1, maxLength: 5000 },
          },
        },
      },
    },
    async (request, reply) =>
      (await reviews.message(
        request.params.workspaceId,
        request.params.runId,
        request.body.text,
      ))
        ? { queued: true }
        : reply.code(409).send({
            message:
              'This task is not waiting for a reply. Stop the current task or start a new one to change instructions.',
          }),
  );

  app.get<{ Params: Params; Querystring: { after?: string } }>(
    '/api/workspaces/:workspaceId/reviews/:runId/events',
    {
      schema: {
        params,
        querystring: {
          type: 'object',
          properties: { after: { type: 'string', pattern: '^[0-9]{1,18}$' } },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, runId } = request.params;
      const initial = await reviews.detail(workspaceId, runId);
      if (!initial)
        return reply.code(404).send({ message: 'Conversation not found.' });
      const resumed = request.headers['last-event-id'];
      let cursor =
        typeof resumed === 'string' && /^\d{1,18}$/.test(resumed)
          ? resumed
          : (request.query.after ?? '0');
      const controller = new AbortController();
      const close = () => controller.abort();
      reply.raw.on('close', close);
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Content-Type-Options': 'nosniff',
      });
      async function send(type: string, data: unknown, id?: string) {
        if (controller.signal.aborted) return;
        const body = `${id ? `id: ${id}\n` : ''}event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        if (!reply.raw.write(body))
          await once(reply.raw, 'drain', { signal: controller.signal });
      }
      let signature = '';
      let polls = 0;
      try {
        while (!controller.signal.aborted) {
          const events = await reviews.events(workspaceId, runId, cursor);
          for (const event of events) {
            await send('activity', event, event.id);
            cursor = event.id;
          }
          const detail =
            polls === 0 ? initial : await reviews.detail(workspaceId, runId);
          if (!detail) break;
          const version = JSON.stringify([
            detail.run.updatedAt,
            detail.run.status,
            detail.run.modelCalls,
            detail.run.phase,
          ]);
          if (version !== signature) {
            await send('snapshot', { ...detail, trace: [] });
            signature = version;
          }
          if (
            events.length < 200 &&
            ['completed', 'failed', 'cancelled'].includes(detail.run.status)
          ) {
            await send('end', {});
            break;
          }
          if (++polls % 20 === 0) await send('heartbeat', {});
          await delay(events.length === 200 ? 0 : 500, undefined, {
            signal: controller.signal,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted)
          request.log.error({ err: error }, 'Conversation stream interrupted');
      } finally {
        reply.raw.off('close', close);
        reply.raw.end();
      }
    },
  );
}
