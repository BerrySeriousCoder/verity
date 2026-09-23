import type { ReviewCheck } from '@verity/core';

const normalize = (text: string) =>
  text.toLowerCase().replace(/\s+/g, ' ').trim();
const stopwords = new Set(
  'the and for with from this that policy quotation coverage clause extension limit of to in on a an'.split(
    ' ',
  ),
);
export function searchTerms(title: string): string[] {
  return [
    ...new Set(
      normalize(title.replace(/^\[[^\]]+\]\s*/, '')).match(/[\p{L}\p{N}]+/gu) ??
        [],
    ),
  ].filter((word) => word.length > 1 && !stopwords.has(word));
}

/** Retrieval hints, never evidence of alignment or absence. */
export function rankedCounterparts(
  check: ReviewCheck,
  checks: ReviewCheck[],
  documentIds: string[],
): ReviewCheck[] {
  const terms = new Set(searchTerms(check.title));
  const frequency = new Map<string, number>();
  const candidates = checks.filter(
    (other) =>
      other.direction !== check.direction &&
      other.relationshipId === check.relationshipId &&
      other.members.every((member) => documentIds.includes(member.documentId)),
  );
  for (const other of candidates)
    for (const term of searchTerms(other.title))
      frequency.set(term, (frequency.get(term) ?? 0) + 1);
  return candidates
    .map((other) => ({
      other,
      score: searchTerms(other.title)
        .filter((word) => terms.has(word))
        .reduce(
          (sum, word) =>
            sum + Math.log(1 + candidates.length / (frequency.get(word) ?? 1)),
          0,
        ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.other.id.localeCompare(b.other.id))
    .map(({ other }) => other);
}

export function relatedChecks(checks: ReviewCheck[]): ReviewCheck[] {
  const key = (check: ReviewCheck) =>
    JSON.stringify([
      check.relationshipId ?? '',
      normalize(check.category),
      [...new Set(check.members.map((member) => member.documentId))].sort(),
      searchTerms(check.title).sort(),
      check.id,
    ]);
  return [...checks].sort((a, b) => key(a).localeCompare(key(b)));
}

/** Exact-title candidates share investigation, never an assumed verdict. v4
 * tolerates differing source references and duplicate categories while preserving
 * every obligation. Ambiguous/answered checks stay separate. */
export function pairedChecks(
  checks: ReviewCheck[],
  answers: Record<string, string>,
  shareDifferentReferences = false,
): Map<string, ReviewCheck[]> {
  const buckets = new Map<string, ReviewCheck[]>();
  for (const check of checks) {
    const references = [
      ...new Set(
        check.members.flatMap((member) => member.references).map(normalize),
      ),
    ].sort();
    const key =
      check.applicability?.uncertain || answers[check.id]
        ? check.id
        : JSON.stringify([
            check.relationshipId ?? '',
            ...(shareDifferentReferences ? [] : [normalize(check.category)]),
            normalize(check.title),
            ...(shareDifferentReferences ? [] : [references]),
          ]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(check);
    buckets.set(key, bucket);
  }
  const result = new Map<string, ReviewCheck[]>();
  for (const bucket of buckets.values()) {
    const sameSourcesPerDirection = [
      'policy_to_quotation',
      'quotation_to_policy',
    ].every(
      (direction) =>
        new Set(
          bucket
            .filter((check) => check.direction === direction)
            .map((check) =>
              JSON.stringify(
                [
                  ...new Set(
                    check.members.flatMap((member) => member.evidenceIds),
                  ),
                ].sort(),
              ),
            ),
        ).size <= 1,
    );
    if (
      (bucket.length === 2 && bucket[0]!.direction !== bucket[1]!.direction) ||
      (shareDifferentReferences && bucket.length > 1 && sameSourcesPerDirection)
    ) {
      const ordered = [...bucket].sort((a, b) => a.id.localeCompare(b.id));
      result.set(ordered[0]!.id, ordered);
    } else for (const check of bucket) result.set(check.id, [check]);
  }
  return result;
}

/** Remove ledger-only fields, retaining every source obligation and qualification. */
export function promptCheck(check: ReviewCheck) {
  return {
    id: check.id,
    title: check.title,
    category: check.category,
    direction: check.direction,
    relationshipId: check.relationshipId,
    applicability: check.applicability,
    members: check.members.map(
      ({ title, documentId, evidenceIds, references }) => ({
        title,
        documentId,
        evidenceIds,
        references,
      }),
    ),
  };
}
