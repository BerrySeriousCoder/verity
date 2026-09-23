import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReviewCheck, EvidenceBlock } from '@verity/core';
import {
  pairedChecks,
  rankedCounterparts,
  relatedChecks,
} from './review-efficiency.js';
import { projectEvidence } from './prompt-evidence.js';
import { expandInventory } from './inventory.js';

function check(
  id: string,
  direction: ReviewCheck['direction'],
  title = 'Earthquake limit at Delhi',
): ReviewCheck {
  return {
    id,
    direction,
    title,
    category: 'Limits',
    relationshipId: 'fire',
    state: 'ready',
    workerId: null,
    finding: null,
    members: [
      {
        id,
        title,
        documentId: direction === 'policy_to_quotation' ? 'policy' : 'quote',
        evidenceIds: [id],
        references: [],
      },
    ],
  };
}
test('reuse retains both directions and refuses ambiguous, qualified, cross-group and answered pairs', () => {
  const p = check('p', 'policy_to_quotation'),
    q = check('q', 'quotation_to_policy');
  assert.deepEqual([...pairedChecks([p, q], {}).values()], [[p, q]]);
  for (const other of [
    { ...q, title: 'Earthquake limit at Mumbai' },
    { ...q, relationshipId: 'flop' },
    { ...q, applicability: { uncertain: true, reason: 'Unknown location' } },
    {
      ...q,
      members: [{ ...q.members[0]!, references: ['subject to endorsement'] }],
    },
  ])
    assert.equal(pairedChecks([p, other], {}).size, 2);
  assert.equal(pairedChecks([p, q], { q: 'check the second period' }).size, 2);
  assert.equal(pairedChecks([p, q, { ...q, id: 'q2' }], {}).size, 3);
});
test('retrieval ranks distinguishing terms and excludes other relationships', () => {
  const p = check('p', 'policy_to_quotation');
  const exact = check('exact', 'quotation_to_policy');
  const broad = check('broad', 'quotation_to_policy', 'Flood limit');
  const wrong = { ...exact, id: 'wrong', relationshipId: 'flop' };
  assert.deepEqual(
    rankedCounterparts(p, [broad, wrong, exact], ['quote']).map(
      (item) => item.id,
    ),
    ['exact'],
  );
  assert.deepEqual(relatedChecks([p, exact]), relatedChecks([exact, p]));
});
test('sheet projection keeps formulas, cell addresses, merged ranges and nonduplicated cell data', () => {
  const source = {
    id: 'x',
    documentId: 'doc',
    unitId: 'u',
    text: 'B5: 125 [formula: 100+25]',
    anchor: {
      kind: 'sheet',
      sheet: 'RFQ',
      row: 4,
      cells: [
        { column: 1, text: '125', formula: '100+25', mergedWith: 'B5:C5' },
      ],
    },
  };
  const projected = projectEvidence(source);
  assert.equal(projected['text'], source.text);
  assert.deepEqual(projected['location'], {
    kind: 'sheet',
    sheet: 'RFQ',
    row: 4,
    merges: [{ column: 1, mergedWith: 'B5:C5' }],
  });
  assert.deepEqual(
    (
      projectEvidence({ ...source, text: 'Different extraction' })[
        'location'
      ] as { cells: unknown }
    ).cells,
    source.anchor.cells,
  );
  assert.ok(source.anchor.cells.length, 'source object stays intact');
});
test('compact inventory cannot omit blocks or invent local references/categories', () => {
  const blocks = ['a', 'b'].map((id) => ({
    id,
    text: id,
    unitId: 'page',
    ordinal: 0,
    anchor: { kind: 'pdf', pageIndex: 0, rectangles: [] },
  })) as EvidenceBlock[];
  const value = {
    obligations: [
      { title: 'Flood', category: 0, sources: [0], references: ['section 2'] },
    ],
    exclusions: [{ sources: [1], reason: 'Page header' }],
  };
  assert.deepEqual(
    expandInventory(value, blocks, ['Limits']).obligations[0]?.evidenceIds,
    ['a'],
  );
  assert.throws(
    () => expandInventory({ ...value, exclusions: [] }, blocks, ['Limits']),
    /omitted/,
  );
  assert.throws(() => expandInventory(value, blocks, []), /category/);
  assert.throws(
    () =>
      expandInventory(
        { ...value, exclusions: [{ sources: [2], reason: 'header' }] },
        blocks,
        ['Limits'],
      ),
    /source index/,
  );
});

test('v4 shares reciprocal work despite different source values, retaining all obligations', () => {
  const p = check('p', 'policy_to_quotation'),
    q = check('q', 'quotation_to_policy');
  p.members[0]!.references = ['Policy: monthly declarations'];
  q.members[0]!.references = ['Quotation: quarterly declarations'];
  const groups = pairedChecks(
    [p, q, { ...p, id: 'p2', category: 'Conditions' }],
    {},
    true,
  );
  assert.equal(groups.size, 1);
  assert.deepEqual([...groups.values()][0]!.map((item) => item.id).sort(), [
    'p',
    'p2',
    'q',
  ]);
  assert.equal(
    pairedChecks(
      [
        p,
        q,
        {
          ...q,
          id: 'other',
          members: [{ ...q.members[0]!, evidenceIds: ['other-location'] }],
        },
      ],
      {},
      true,
    ).size,
    3,
  );
});
