import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { EvidenceRepository } from '@verity/database';
import { LOCAL_WORKSPACE_ID } from '@verity/database';
import { ModelResponseError, type ReviewModel } from '@verity/agent';
export function scriptedModel(
  policyId: string,
  quoteId: string,
  evidence: EvidenceRepository,
  options: {
    vague?: boolean;
    invalidCitation?: boolean;
    omitBlock?: boolean;
    withQuestions?: boolean;
    failOnce?: boolean;
  } = {},
): ReviewModel {
  let failurePending = options.failOnce ?? false;
  return {
    async generate(role, instruction, raw, schema, _signal, onProgress) {
      if (failurePending) {
        failurePending = false;
        throw new ModelResponseError({
          message: 'Test model response was incomplete.',
          status: 'incomplete',
          retryable: true,
          inputTokens: 7,
          outputTokens: 11,
          model: 'test-double',
        });
      }
      const input = (raw as { input: Record<string, unknown> }).input;
      let value: unknown;
      await onProgress?.(
        'Inspecting the supplied evidence before choosing the next step.',
      );
      if (instruction.startsWith('Map the attached'))
        value = {
          policyIds: [policyId],
          quotationIds: [quoteId],
          groups: [
            {
              id: 'flood',
              title: 'Flood',
              policyIds: [policyId],
              quotationIds: [quoteId],
              description: 'Flood limits for this policy.',
            },
          ],
          question: null,
        };
      else if (instruction.startsWith('Determine whether the latest'))
        value = { action: 'accept', question: null };
      else if (instruction.startsWith('Assign each quotation')) {
        const items = input['items'] as { check: { id: string } }[];
        value = {
          items: items.map((item) => ({
            id: item.check.id,
            groupIds: ['flood'],
            uncertain: false,
            reason: 'Flood requirement applies to the confirmed policy.',
          })),
        };
      } else if (instruction.startsWith('Identify'))
        value = { policyId, quotationIds: [quoteId], question: null };
      else if (instruction.startsWith('Propose'))
        value = {
          description: 'Compare flood limits in both directions.',
          categories: ['Flood'],
          needsClarification: options.vague ?? false,
        };
      else if (
        instruction.startsWith('Inventory') ||
        instruction.startsWith('Reconcile')
      ) {
        if (role === 'auditor' && instruction.startsWith('Inventory'))
          assert.equal(
            'reviewer' in input,
            false,
            'independent auditor must not see reviewer inventory',
          );
        const blocks = input['blocks'] as {
          id: string;
          text: string;
          index?: number;
        }[];
        const compact = blocks[0]?.index !== undefined;
        value = {
          obligations: options.omitBlock
            ? []
            : [
                {
                  title: 'Flood limit',
                  category: compact ? 0 : 'Flood',
                  ...(compact
                    ? { sources: blocks.map((block) => block.index) }
                    : { evidenceIds: blocks.map((block) => block.id) }),
                  references: [],
                },
              ],
          exclusions: [],
        };
      } else if (instruction.startsWith('Group only')) {
        const members = input['members'] as { id: string; title: string }[];
        value = {
          groups: [
            {
              title: 'Flood limit',
              memberIds: members.map((member) => member.id),
            },
          ],
        };
      } else if (instruction.startsWith('Compare every')) {
        const bundles = input['bundles'] as {
          check: { id: string };
          evidence: { id: string }[];
        }[];
        value = {
          items: bundles.map((bundle) => ({
            id: bundle.check.id,
            requests: [],
            calculation: null,
            decision: {
              status: options.withQuestions ? 'needs_input' : 'aligned',
              explanation: 'Both sources state the flood limit is 1250.',
              evidenceIds: options.invalidCitation
                ? [randomUUID()]
                : bundle.evidence.map((item) => item.id),
              question:
                options.withQuestions &&
                !(input['userAnswers'] as Record<string, string>)[
                  bundle.check.id
                ]
                  ? 'Which effective period applies to this limit?'
                  : null,
              requiresCalculation: false,
            },
          })),
        };
      } else if (instruction.startsWith('Independently verify each')) {
        const items = input['items'] as { id: string }[];
        value = {
          items: items.map((item) => ({
            id: item.id,
            verification: {
              supported: !options.withQuestions,
              reason: 'Both original excerpts state the same limit.',
              question: null,
            },
          })),
        };
      } else if (instruction.startsWith('Compare the source')) {
        const obligation = input['obligation'] as {
          id: string;
          documentId: string;
          evidenceIds: string[];
        };
        const counterpart = await evidence.search(
          LOCAL_WORKSPACE_ID,
          [obligation.documentId === policyId ? quoteId : policyId],
          'Flood',
        );
        const history = input['history'] as unknown[];
        value = {
          action: history.length ? 'finish' : 'read_evidence',
          query: null,
          evidenceIds: history.length ? [] : counterpart.map((item) => item.id),
          inventoryOffset: null,
          documentId: null,
          unitId: null,
          calculation: null,
          decision: history.length
            ? {
                status: options.withQuestions ? 'needs_input' : 'aligned',
                explanation: 'Both sources state the flood limit is 1250.',
                evidenceIds: options.invalidCitation
                  ? [randomUUID()]
                  : [
                      ...obligation.evidenceIds,
                      ...counterpart.map((item) => item.id),
                    ],
                question:
                  options.withQuestions &&
                  !(input['userAnswers'] as Record<string, string>)[
                    obligation.id
                  ]
                    ? 'Which effective period applies to this limit?'
                    : null,
                requiresCalculation: false,
              }
            : null,
        };
      } else
        value = {
          supported: !options.withQuestions,
          reason: 'Both original excerpts state the same limit.',
          question: null,
        };
      return {
        value: schema.parse(value),
        inputTokens: 10,
        outputTokens: 10,
        model: 'test-double',
      };
    },
  };
}
