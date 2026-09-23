import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResolvedEvidence } from '@verity/core';
import {
  comparisonContext,
  unresolvedLimitDependency,
} from './comparison-context.js';
function block(
  id: string,
  documentId: string,
  text: string,
  ordinal = 0,
): ResolvedEvidence {
  return {
    id,
    documentId,
    text,
    ordinal,
    unitId: documentId,
    filename: documentId,
    extractionId: documentId,
    label: 'Page 1',
    anchor: { kind: 'pdf', pageIndex: 0, rectangles: [] },
  };
}
const sources = [
  block('p-clause', 'p', 'Fire: up to total sum insured', 0),
  block('p-label', 'p', 'Total sum insured', 1),
  block('p-value', 'p', 'INR 9,500,000', 2),
  block('q-clause', 'q', 'Fire: up to total sum insured', 0),
  block('q-label', 'q', 'Total sum insured: INR 10,000,000', 1),
];
const guard = (
  evidence: ResolvedEvidence[],
  citations = evidence.map((block) => block.id),
) =>
  unresolvedLimitDependency(
    'aligned',
    ['p-clause'],
    citations,
    evidence,
    ['p'],
    ['q'],
  );
test('matching wording cannot bypass unequal or missing referenced limits', () => {
  assert.match(guard(sources)!, /differ/);
  assert.match(
    guard(sources.filter((block) => block.id !== 'q-label'))!,
    /not been established/,
  );
  const equal = sources.map((block) =>
    block.id === 'p-value' ? { ...block, text: 'INR 10,000,000' } : block,
  );
  assert.equal(guard(equal), null);
  assert.match(guard(equal, ['p-clause', 'q-clause'])!, /omits citations/);
  assert.equal(
    unresolvedLimitDependency(
      'different',
      ['p-clause'],
      [],
      sources,
      ['p'],
      ['q'],
    ),
    null,
  );
  assert.match(
    guard([
      ...equal,
      block('other-location', 'q', 'Total sum insured INR 10,000,000', 3),
    ])!,
    /unique/,
  );
  assert.match(
    guard(
      equal.map((block) =>
        block.id === 'p-value' ? { ...block, text: 'INR 10 million' } : block,
      ),
    )!,
    /not been established/,
  );
});
test('small document context includes clauses missed by search, caches reads, isolates relationships', async () => {
  let reads = 0;
  const scope = block('scope', 'q', 'One location; material damage only', 10);
  const context = comparisonContext(
    {
      async compactDocument(_workspace, id) {
        reads++;
        return [...sources, scope].filter((block) => block.documentId === id);
      },
      async search() {
        return [];
      },
      async neighbors() {
        return [];
      },
    },
    'workspace',
  );
  const results = await Promise.all([
    context.expand([sources[0]!], ['p', 'q']),
    context.expand([sources[0]!], ['p', 'q']),
  ]);
  assert.equal(reads, 2);
  assert.ok(
    results.every((result) => result.some((block) => block.id === scope.id)),
  );
  assert.ok(
    (await context.expand(sources, ['p'])).every(
      (block) => block.documentId === 'p',
    ),
  );
});
test('large relationships retrieve dependencies and neighboring label/value evidence', async () => {
  let searched = false;
  const context = comparisonContext(
    {
      async compactDocument() {
        return null;
      },
      async search(_workspace, ids, query) {
        searched = true;
        assert.deepEqual(ids, ['p', 'q']);
        assert.equal(query, '"total sum insured"');
        return [sources[1]!, sources[4]!];
      },
      async neighbors(_workspace, ids) {
        assert.ok(ids.includes('p-label'));
        return [sources[2]!];
      },
    },
    'workspace',
  );
  const expanded = await context.expand([sources[0]!], ['p', 'q']);
  assert.ok(searched);
  assert.ok(expanded.some((block) => block.id === 'p-value'));
});
