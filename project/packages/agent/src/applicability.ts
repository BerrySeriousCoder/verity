import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ReviewCheck, DocumentRelationship } from '@verity/core';
import type {
  ReviewJob,
  ReviewRepository,
  EvidenceRepository,
} from '@verity/database';
import type { StructuredCall } from './parallel-review.js';
import { relatedChecks, promptCheck } from './review-efficiency.js';
import { chunks, exactIds } from './parallel-contracts.js';
import { mapConcurrent, concurrencySetting } from './scheduler.js';

export function relationshipDocuments(
  check: ReviewCheck,
  groups: DocumentRelationship[],
  policyIds: string[],
  quotationIds: string[],
) {
  const group = groups.find((group) => group.id === check.relationshipId);
  return group ?? { policyIds, quotationIds };
}

/** Route quotation obligations without deleting unmatched or ambiguous observations. */
export async function applyRelationships(input: {
  checks: ReviewCheck[];
  job: ReviewJob;
  reviews: ReviewRepository;
  evidence: EvidenceRepository;
  call: StructuredCall;
}): Promise<ReviewCheck[]> {
  const { checks, job, reviews, evidence, call } = input;
  const mapping = job.run.documentRelationships;
  if (!mapping?.confirmed) return checks;
  const groups = mapping.groups;
  const routed: ReviewCheck[] = [];
  async function save(
    check: ReviewCheck,
    groupIds: string[],
    uncertain: boolean,
    reason: string,
  ) {
    const targets = groupIds.length ? groupIds : [null];
    for (const groupId of targets) {
      const group = groups.find((group) => group.id === groupId);
      const id = `mapped-${createHash('sha256')
        .update(JSON.stringify([check.id, groupId]))
        .digest('hex')
        .slice(0, 24)}`;
      const mapped: ReviewCheck = {
        ...check,
        id,
        title: group ? `[${group.title}] ${check.title}` : check.title,
        ...(group ? { relationshipId: group.id } : {}),
        applicability: { uncertain: uncertain || !group, reason },
      };
      await reviews.saveCheck(job, mapped);
      routed.push(mapped);
    }
    await reviews.removeDraftCheck(job, check.id);
  }
  for (const check of checks.filter(
    (check) => check.direction === 'policy_to_quotation',
  )) {
    const memberDocs = check.members.map((member) => member.documentId);
    const applicable = groups.filter((group) =>
      memberDocs.every((id) => group.policyIds.includes(id)),
    );
    await save(
      check,
      applicable.map((group) => group.id),
      false,
      'Policy document belongs to this confirmed relationship.',
    );
  }
  const schema = z.object({
    items: z.array(
      z.object({
        id: z.string(),
        groupIds: z.array(z.string()),
        uncertain: z.boolean(),
        reason: z.string().min(1).max(2000),
      }),
    ),
  });
  await mapConcurrent(
    chunks(
      (job.run.batchingVersion >= 3 ? relatedChecks(checks) : checks).filter(
        (check) => check.direction === 'quotation_to_policy',
      ),
      job.run.batchingVersion >= 3 ? 32 : 16,
    ),
    concurrencySetting(),
    async (packet) => {
      const key = createHash('sha256')
        .update(JSON.stringify([mapping, packet.map((check) => check.id)]))
        .digest('hex')
        .slice(0, 24);
      const items = await Promise.all(
        packet.map(async (check) => ({
          check: job.run.batchingVersion >= 3 ? promptCheck(check) : check,
          evidence: await evidence.resolve(
            job.run.workspaceId,
            [...new Set(check.members.flatMap((member) => member.evidenceIds))],
            job.run.quotationIds,
          ),
        })),
      );
      const result = await call(
        `relationships/applicability/${key}`,
        'reviewer',
        'Assign each quotation requirement to the applicable confirmed relationship groups. Return every check ID exactly once. Use the quotation requirement, section/sheet provenance, entity, location, coverage type and confirmed group descriptions. Shared terms may apply to multiple groups. Do not assign a FLOP requirement to an unrelated fire policy. Never use absence from a policy as a reason to exclude a quotation requirement. If evidence does not establish applicability, set uncertain=true and explain; use empty groupIds if no group can be established. Do not invent groups. These are routing decisions, not coverage verdicts.',
        { groups, items },
        schema,
        (value) => {
          exactIds(
            value.items.map((item) => item.id),
            packet.map((check) => check.id),
          );
          for (const item of value.items) {
            const check = packet.find((check) => check.id === item.id)!;
            if (
              new Set(item.groupIds).size !== item.groupIds.length ||
              item.groupIds.some(
                (id) =>
                  !groups.some(
                    (group) =>
                      group.id === id &&
                      check.members.every((member) =>
                        group.quotationIds.includes(member.documentId),
                      ),
                  ),
              )
            )
              throw new Error(
                'Applicability references a group outside the source document relationship.',
              );
          }
        },
        {
          id: `applicability/${key}`,
          title: `Map quotation requirements · ${packet.length} checks`,
        },
      );
      for (const item of result.items)
        await save(
          packet.find((check) => check.id === item.id)!,
          item.groupIds,
          item.uncertain,
          item.reason,
        );
    },
  );
  // Every original observation must remain represented after relationship expansion.
  const expected = new Set(
    checks.flatMap((check) => check.members.map((member) => member.id)),
  );
  const actual = new Set(
    routed.flatMap((check) => check.members.map((member) => member.id)),
  );
  exactIds([...actual], [...expected]);
  return routed.sort((a, b) => a.id.localeCompare(b.id));
}
