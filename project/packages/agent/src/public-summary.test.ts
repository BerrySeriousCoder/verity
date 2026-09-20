import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicSummaryPrefix } from './public-summary.js';

test('decodes only the leading public progress summary from partial JSON', () => {
  assert.equal(
    publicSummaryPrefix(
      '{"publicSummary":"Reading page 4\\nfor exclusions","result":{"secret":"hidden"}}',
    ),
    'Reading page 4\nfor exclusions',
  );
  assert.equal(
    publicSummaryPrefix('{"publicSummary":"Still read'),
    'Still read',
  );
});

test('never scans later output fields for display text', () => {
  assert.equal(
    publicSummaryPrefix(
      '{"result":{"publicSummary":"do not expose"},"publicSummary":"late"}',
    ),
    '',
  );
  assert.equal(publicSummaryPrefix('not json'), '');
});
