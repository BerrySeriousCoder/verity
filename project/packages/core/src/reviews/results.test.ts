import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReviewFinding } from './types.js';
import { isResolvedFinding, reviewSummary } from './results.js';
test('historical verifier acceptance of uncertainty never counts as resolved', () => {
  const finding: ReviewFinding = {
    id: 'x',
    title: 'Scope',
    category: 'Clauses',
    direction: 'policy_to_quotation',
    status: 'unverified',
    verified: true,
    explanation: 'Unknown',
    evidenceIds: [],
    question: 'Clarify?',
    verification: 'Uncertainty accepted',
    userAnswer: null,
  };
  for (const status of ['unverified', 'needs_input', 'not_found'] as const)
    assert.equal(isResolvedFinding({ ...finding, status }), false);
  assert.match(
    reviewSummary([finding, { ...finding, id: 'y', status: 'different' }]),
    /1 checks have verified differences; 1 remain unresolved/,
  );
  assert.equal(
    isResolvedFinding({ ...finding, status: 'aligned', verified: false }),
    false,
  );
});
