import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { parseSpreadsheet } from './spreadsheet.js';
import { validateWorkbookArchive } from './workbook-archive.js';

test('CSV preserves quoted multiline cells, blank records, and original coordinates', async () => {
  const units = await parseSpreadsheet(
    new TextEncoder().encode(
      'item,amount\n"Flood\nextension",1250\n\nFire,300',
    ),
    'csv',
  );
  const blocks = units.flatMap((unit) => unit.blocks);
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks[1]?.anchor, {
    kind: 'sheet',
    sheet: 'CSV',
    row: 1,
    cells: [
      { column: 0, text: 'Flood\nextension' },
      { column: 1, text: '1250' },
    ],
  });
  assert.match(blocks[3]?.text ?? '', /A4: Fire/);
});

test('workbook retains hidden sheets and cached formulas without executing them', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Terms', { state: 'hidden' });
  sheet.getCell('A5').value = 'Premium';
  sheet.getCell('B5').value = { formula: '100+25', result: 125 };
  sheet.getCell('C5').value = { formula: 'B5*2' };
  const units = await parseSpreadsheet(
    new Uint8Array(await workbook.xlsx.writeBuffer()),
    'xlsx',
  );
  assert.equal(units[0]?.locator['hidden'], true);
  assert.match(units[0]?.warnings.join(' ') ?? '', /no cached result/);
  assert.match(units[0]?.blocks[0]?.text ?? '', /B5: 125 \[formula: 100\+25\]/);
  assert.equal(units[0]?.blocks[0]?.anchor.kind, 'sheet');
});

test('rejects invalid UTF-8 and oversized cells before model use', async () => {
  await assert.rejects(parseSpreadsheet(new Uint8Array([255]), 'csv'));
  await assert.rejects(
    parseSpreadsheet(new TextEncoder().encode('x'.repeat(16001)), 'csv'),
    /character limit/,
  );
});

test('rejects oversized declared workbook expansion before parsing', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Sheet1').getCell('A1').value = 'test';
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(central >= 0);
  bytes.writeUInt32LE(33 * 1024 * 1024, central + 24);
  assert.throws(() => validateWorkbookArchive(bytes), /extraction limits/);
});
