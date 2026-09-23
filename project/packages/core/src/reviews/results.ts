import type { ReviewFinding } from './types.js';

/** A verifier accepting uncertainty is not a resolved comparison. */
export function isResolvedFinding(finding: ReviewFinding): boolean {
  return (
    finding.verified &&
    (finding.status === 'aligned' || finding.status === 'different')
  );
}
export function reviewSummary(findings: ReviewFinding[]): string {
  const different = findings.filter(
    (finding) => isResolvedFinding(finding) && finding.status === 'different',
  ).length;
  const unresolved = findings.filter(
    (finding) => !isResolvedFinding(finding),
  ).length;
  return `Finished processing ${findings.length} directional checks. ${different} checks have verified mismatches; ${unresolved} remain unresolved. Reciprocal checks may describe the same discrepancy.`;
}

/** Persisted statuses remain stable for existing reviews and API clients. */
export function findingStatusLabel(status: ReviewFinding['status']): string {
  return status === 'different' ? 'Mismatch' : status.replaceAll('_', ' ');
}
