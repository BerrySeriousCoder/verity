import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { extractDocument } from '../packages/ingestion/src/index.js';
test('short fictional fixtures extract with citations, discrepancies and cached spreadsheet formula', async () => {
  const directory = new URL('../../testdoc/dummy/', import.meta.url);
  const pdf = await extractDocument(
    await readFile(new URL('demo-policy.pdf', directory)),
    'pdf',
  );
  const sheet = await extractDocument(
    await readFile(new URL('demo-placement-slip.xlsx', directory)),
    'xlsx',
  );
  assert.equal(pdf.length, 1);
  assert.equal(sheet.length, 1);
  const policyText = pdf
    .flatMap((unit) => unit.blocks.map((block) => block.text))
    .join('\n');
  const quoteText = sheet
    .flatMap((unit) => unit.blocks.map((block) => block.text))
    .join('\n');
  assert.match(policyText, /FICTIONAL TEST DOCUMENT/);
  assert.match(policyText, /2,500,000/);
  assert.match(policyText, /29,400/);
  assert.match(quoteText, /3,000,000/);
  assert.match(quoteText, /29500 \[formula: SUM\(C23:C24\)\]/);
  assert.equal(pdf[0]?.blocks[0]?.anchor.kind, 'pdf');
  assert.equal(sheet[0]?.blocks[0]?.anchor.kind, 'sheet');
  assert.ok(
    ![...pdf, ...sheet]
      .flatMap((unit) => unit.warnings)
      .some((warning) => /OCR|Embedded images/.test(warning)),
  );
});
