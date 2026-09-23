import assert from 'node:assert/strict';
import test from 'node:test';
import { compactEvidence, projectEvidence } from './prompt-evidence.js';
const source = {
  id: 'id-1',
  documentId: 'doc',
  unitId: 'page',
  text: 'Original evidence '.repeat(100),
  anchor: { kind: 'pdf', pageIndex: 4, rectangles: [[1, 2, 3, 4]] },
};
function expand(value: unknown, table: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => expand(item, table));
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  if (typeof object['evidenceRef'] === 'string')
    return table[object['evidenceRef']];
  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [key, expand(item, table)]),
  );
}
test('shared evidence preserves text and identity, with check-scoped references', () => {
  const input = {
    input: {
      bundles: [
        { check: { id: 'a' }, evidence: [source] },
        { check: { id: 'b' }, evidence: [source, { ...source, id: 'id-2' }] },
        {
          check: { id: 'c' },
          evidence: [{ ...source, text: 'Conflicting text' }],
        },
      ],
    },
    repair: null,
  };
  const result = compactEvidence(input) as {
    request: unknown;
    evidenceByRef: Record<string, unknown>;
  };
  function project(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(project);
    if (!value || typeof value !== 'object') return value;
    const object = value as Record<string, unknown>;
    if (object['anchor']) return projectEvidence(object);
    return Object.fromEntries(
      Object.entries(object).map(([key, child]) => [key, project(child)]),
    );
  }
  assert.deepEqual(
    expand(result.request, result.evidenceByRef),
    project(input),
  );
  assert.equal(Object.keys(result.evidenceByRef).length, 3);
  assert.ok(JSON.stringify(result).length < JSON.stringify(input).length);
});
test('inventory and requests without duplicate source objects retain their shape', () => {
  const input = { blocks: [{ id: 'x', text: 'source' }] };
  assert.equal(compactEvidence(input), input);
});
