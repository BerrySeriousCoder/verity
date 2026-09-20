import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { EvidenceRepository } from '@verity/database';
import { LOCAL_WORKSPACE_ID } from '@verity/database';
import type { ReviewModel } from '@verity/agent';
export function scriptedModel(
  policyId: string,
  quoteId: string,
  evidence: EvidenceRepository,
  options: {
    vague?: boolean;
    invalidCitation?: boolean;
    omitBlock?: boolean;
    withQuestions?: boolean;
  } = {},
): ReviewModel {
  return {
    async generate(role, instruction, raw, schema, _signal, onProgress) {
      const input = (raw as { input: Record<string, unknown> }).input;
      let value: unknown;
      await onProgress?.(
        'Inspecting the supplied evidence before choosing the next step.',
      );
      if (instruction.startsWith('Identify'))
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
        const blocks = input['blocks'] as { id: string; text: string }[];
        value = {
          obligations: options.omitBlock
            ? []
            : [
                {
                  title: 'Flood limit',
                  category: 'Flood',
                  evidenceIds: blocks.map((block) => block.id),
                  references: [],
                },
              ],
          exclusions: [],
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
