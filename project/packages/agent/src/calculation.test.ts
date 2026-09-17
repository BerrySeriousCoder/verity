import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ResolvedEvidence } from '@verity/core';
import { calculate } from './calculation.js';

const source: ResolvedEvidence = {
  id: 'source',
  unitId: 'unit',
  extractionId: 'extraction',
  documentId: 'document',
  filename: 'quote.csv',
  label: 'Sheet1',
  ordinal: 0,
  text: 'A5: 0.1 | B5: 0.2',
  anchor: {
    kind: 'sheet',
    sheet: 'Sheet1',
    row: 4,
    cells: [
      { column: 0, text: '0.1' },
      { column: 1, text: '0.2' },
    ],
  },
};
test('decimal arithmetic uses cited cell values without binary floating point error', () => {
  assert.equal(
    calculate(
      'sum',
      [
        { value: '0.1', evidenceId: 'source' },
        { value: '0.2', evidenceId: 'source' },
      ],
      [source],
    ).result,
    '0.3',
  );
});
test('rejects row-label numbers, fabricated operands, and divide by zero', () => {
  assert.throws(
    () =>
      calculate(
        'sum',
        [
          { value: '5', evidenceId: 'source' },
          { value: '0.2', evidenceId: 'source' },
        ],
        [source],
      ),
    /does not occur/,
  );
  assert.throws(
    () =>
      calculate(
        'sum',
        [
          { value: '0.1', evidenceId: 'missing' },
          { value: '0.2', evidenceId: 'source' },
        ],
        [source],
      ),
    /unavailable/,
  );
  const zero = {
    ...source,
    text: '0 10',
    anchor: { kind: 'pdf' as const, pageIndex: 0, rectangles: [] },
  };
  assert.throws(
    () =>
      calculate(
        'divide',
        [
          { value: '10', evidenceId: 'source' },
          { value: '0', evidenceId: 'source' },
        ],
        [zero],
      ),
    /finite/,
  );
});
test('does not interpret comma decimals or part-number fragments as amounts', () => {
  const ambiguous = {
    ...source,
    text: 'Part A125 and amount 1,25',
    anchor: { kind: 'pdf' as const, pageIndex: 0, rectangles: [] },
  };
  assert.throws(
    () =>
      calculate(
        'sum',
        [
          { value: '125', evidenceId: 'source' },
          { value: '1', evidenceId: 'source' },
        ],
        [ambiguous],
      ),
    /does not occur/,
  );
});
