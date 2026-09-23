import { Decimal } from 'decimal.js';
import type { ResolvedEvidence } from '@verity/core';
import type { EvidenceRepository } from '@verity/database';

export const dependencyInstruction =
  ' Resolve referenced values before comparing effective coverage: identical phrases such as "up to total sum insured" do not establish equal limits. Find the applicable schedule amount on EACH side, preserve currency, location, period and qualifications, and cite both the coverage wording and referenced values. Distinguish matching peril inclusion from differing effective amounts. Resolve cross-referenced conditions using the supplied context or request more evidence; unresolved dependencies must remain unverified. Do not ask the user to repeat facts established by the supplied documents. Context outside the agreed scope is evidence only, not permission to expand the checklist.';

/** Per-run promise cache avoids rereading small documents for every check. */
export function comparisonContext(
  repository: Pick<
    EvidenceRepository,
    'compactDocument' | 'neighbors' | 'search'
  >,
  workspaceId: string,
) {
  const documents = new Map<string, Promise<ResolvedEvidence[] | null>>();
  function compact(id: string) {
    let pending = documents.get(id);
    if (!pending) {
      pending = repository.compactDocument(workspaceId, id);
      documents.set(id, pending);
    }
    return pending;
  }
  return {
    async expand(seeds: ResolvedEvidence[], documentIds: string[]) {
      const ids = [...new Set(documentIds)];
      const small = await Promise.all(ids.map(compact));
      // Bound aggregate context as well as each document. Large relationships
      // use targeted retrieval instead of copying every small document per check.
      const full = small.flatMap((blocks) => blocks ?? []);
      const includeFull =
        full.reduce((sum, block) => sum + block.text.length, 0) <= 24000;
      const largeIds = ids.filter((_, index) => !includeFull || !small[index]);
      const dependencies =
        /total\s+sum\s+insured/i.test(
          seeds.map((block) => block.text).join('\n'),
        ) && largeIds.length
          ? await repository.search(
              workspaceId,
              largeIds,
              '"total sum insured"',
              0,
              12,
            )
          : [];
      const adjacent = await repository.neighbors(
        workspaceId,
        [...seeds, ...dependencies]
          .filter((block) => largeIds.includes(block.documentId))
          .map((block) => block.id),
        largeIds,
      );
      return [
        ...new Map(
          [...seeds, ...(includeFull ? full : []), ...dependencies, ...adjacent]
            .filter((block) => ids.includes(block.documentId))
            .map((block) => [block.id, block]),
        ).values(),
      ];
    },
  };
}

/** Conservative guard for explicit monetary total-sum-insured references. This
 * never manufactures a difference verdict or chooses among ambiguous schedules. */
export function unresolvedLimitDependency(
  status: string,
  ownIds: string[],
  citedIds: string[],
  sources: ResolvedEvidence[],
  policyIds: string[],
  quotationIds: string[],
): string | null {
  if (
    status !== 'aligned' ||
    !sources.some(
      (block) =>
        ownIds.includes(block.id) && /total\s+sum\s+insured/i.test(block.text),
    )
  )
    return null;
  function values(documentIds: string[]) {
    const found: { value: string; ids: string[] }[] = [];
    for (const label of sources.filter(
      (block) =>
        documentIds.includes(block.documentId) &&
        /total\s+sum\s+insured/i.test(block.text),
    )) {
      // A coverage reference is not the schedule definition.
      if (/up to|subject to|full total|full sum/i.test(label.text)) continue;
      const next = sources.find(
        (block) =>
          block.documentId === label.documentId &&
          block.unitId === label.unitId &&
          block.ordinal === label.ordinal + 1,
      );
      const ownMatches = [
        ...label.text.matchAll(
          /\b(INR|USD|EUR|GBP)\s+((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![\d,.])/gi,
        ),
      ];
      const block = ownMatches.length ? label : next;
      if (!block) continue;
      const matches = ownMatches.length
        ? ownMatches
        : [
            ...block.text.matchAll(
              /\b(INR|USD|EUR|GBP)\s+((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![\d,.])/gi,
            ),
          ];
      for (const match of matches) {
        // Scaled and percentage expressions require semantic/typed resolution.
        const suffix = block.text.slice((match.index ?? 0) + match[0].length);
        if (/^\s*(million|billion|crore|lakh|thousand|%)/i.test(suffix))
          continue;
        found.push({
          value: `${match[1]!.toUpperCase()}:${new Decimal(match[2]!.replaceAll(',', '')).toString()}`,
          ids: [...new Set([label.id, block.id])],
        });
      }
    }
    return found;
  }
  const policy = values(policyIds),
    quote = values(quotationIds);
  if (policy.length !== 1 || quote.length !== 1)
    return 'Effective limit depends on total sum insured, but a unique applicable monetary value on each side has not been established.';
  if (policy[0]!.value !== quote[0]!.value)
    return 'Matching coverage wording does not establish alignment: referenced total sums insured differ.';
  if (
    ![...policy[0]!.ids, ...quote[0]!.ids].every((id) => citedIds.includes(id))
  )
    return 'The aligned conclusion omits citations establishing its referenced total sums insured.';
  return null;
}
