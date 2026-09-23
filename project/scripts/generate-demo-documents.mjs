import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const apiRequire = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const ingestionRequire = createRequire(
  new URL('../packages/ingestion/package.json', import.meta.url),
);
const { PDFDocument, StandardFonts, rgb } = apiRequire('pdf-lib');
const ExcelJS = ingestionRequire('exceljs');
const directory = new URL('../../testdoc/dummy/', import.meta.url);
await mkdir(directory, { recursive: true });
const rows = [
  [
    'Insured',
    'Aster Vale Workshop Private Limited (fictional)',
    'Aster Vale Workshop Private Limited (fictional)',
  ],
  [
    'Risk location',
    'Unit 7, Example Industrial Estate, Sample City',
    'Unit 7, Example Industrial Estate, Sample City',
  ],
  [
    'Period of insurance',
    '01 Oct 2026 to 30 Sep 2027 inclusive',
    '01 Oct 2026 to 30 Sep 2027 inclusive',
  ],
  ['Building sum insured', 'INR 5,000,000', 'INR 5,000,000'],
  ['Plant and machinery sum insured', 'INR 3,000,000', 'INR 2,500,000'],
  ['Stock sum insured', 'INR 2,000,000', 'INR 2,000,000'],
  ['Total sum insured', 'INR 10,000,000', 'INR 9,500,000'],
  [
    'Fire and lightning',
    'Included up to total sum insured',
    'Included up to total sum insured',
  ],
  [
    'Storm, tempest, flood and inundation',
    'Included up to total sum insured',
    'Included up to total sum insured',
  ],
  [
    'Earthquake',
    'Included up to total sum insured',
    'Excluded; no earthquake cover is provided',
  ],
  [
    'Removal of debris extension',
    'INR 250,000 any one occurrence',
    'INR 100,000 any one occurrence',
  ],
  [
    'Expediting expenses extension',
    'INR 100,000 any one occurrence',
    'INR 50,000 any one occurrence',
  ],
  [
    'Standard deductible',
    'INR 10,000 each and every claim',
    'INR 25,000 each and every claim',
  ],
  [
    'Stock declaration condition',
    'Quarterly declaration within 15 days of quarter end',
    'Monthly declaration within 15 days of month end',
  ],
  [
    'Sprinkler warranty',
    'No sprinkler warranty required',
    'Operative automatic sprinklers required at all times',
  ],
  [
    'Business interruption',
    'Excluded; material damage only',
    'Excluded; material damage only',
  ],
  ['Base premium', 'INR 25,000', 'INR 25,000'],
  ['GST at 18%', 'INR 4,500', 'INR 4,500'],
  ['Total premium payable', 'INR 29,500', 'INR 29,400'],
];
const pdf = await PDFDocument.create();
pdf.setTitle('Demo final fire policy - fictional test fixture');
pdf.setAuthor('Verity test fixtures');
pdf.setCreationDate(new Date('2026-09-23T00:00:00Z'));
pdf.setModificationDate(new Date('2026-09-23T00:00:00Z'));
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const navy = rgb(0.08, 0.17, 0.28),
  muted = rgb(0.32, 0.38, 0.43);
const page = pdf.addPage([595.28, 841.89]);
function text(value, x, y, size = 10, font = regular, color = navy) {
  page.drawText(value, { x, y, size, font, color });
}
text('MERIDIAN DEMO ASSURANCE', 38, 800, 17, bold);
text('FICTIONAL TEST DOCUMENT - NOT VALID INSURANCE', 38, 780, 9, bold);
text(
  'Standard Fire & Special Perils | Final Policy Schedule',
  38,
  746,
  13,
  bold,
);
text(
  'Policy: DEMO-FIRE-2026-001   |   Quote reference: DEMO-PS-2026-001',
  38,
  727,
  9,
);
text(
  'Issued: 23 Sep 2026   |   Currency: INR   |   All names and figures are fabricated.',
  38,
  711,
  9,
);
let y = 679;
for (const [index, row] of rows.entries()) {
  const section = row[0],
    value = row[2];
  page.drawRectangle({
    x: 34,
    y: y - 20,
    width: 527,
    height: 29,
    color: index % 2 ? rgb(1, 1, 1) : rgb(0.94, 0.96, 0.98),
  });
  text(`${String(index + 1).padStart(2, '0')}. ${section}`, 40, y, 8.8, bold);
  // A full-width second line keeps all qualifications readable and extractable.
  text(value, 56, y - 12, 9.2);
  y -= 29;
}
text('Schedule conditions', 38, 100, 10, bold);
text(
  'The amounts and conditions above apply only to the single insured location stated.',
  38,
  84,
  9,
  regular,
  muted,
);
text(
  'This schedule is the complete wording for this test. No external endorsements apply.',
  38,
  70,
  9,
  regular,
  muted,
);
text(
  'Sample prepared for software testing only. No signature or payment is required.',
  38,
  45,
  8,
  regular,
  muted,
);
text('Page 1 of 1', 507, 28, 8, regular, muted);
await writeFile(new URL('demo-policy.pdf', directory), await pdf.save());
const workbook = new ExcelJS.Workbook();
workbook.creator = 'Verity test fixtures';
workbook.created = new Date('2026-09-23T00:00:00Z');
workbook.modified = workbook.created;
const sheet = workbook.addWorksheet('Placement Slip', {
  views: [{ state: 'frozen', ySplit: 6 }],
});
sheet.columns = [{ width: 7 }, { width: 37 }, { width: 73 }];
for (const [row, value] of [
  [1, 'CEDAR DEMO RISK BROKERS - PLACEMENT SLIP'],
  [2, 'FICTIONAL TEST DOCUMENT - NOT AN OFFER OF INSURANCE'],
  [3, 'Quote: DEMO-PS-2026-001 | For final policy DEMO-FIRE-2026-001'],
  [4, 'Insurer: Meridian Demo Assurance (fictional) | Quoted: 20 Sep 2026'],
]) {
  sheet.mergeCells(row, 1, row, 3);
  sheet.getCell(row, 1).value = value;
  sheet.getRow(row).height = row < 3 ? 25 : 21;
}
sheet.getRow(6).values = [
  'No.',
  'Item / condition',
  'Offered terms (INR where monetary)',
];
for (const [index, row] of rows.entries()) {
  const target = sheet.getRow(index + 7);
  target.values = [index + 1, row[0], row[1]];
  target.height = 30;
}
// Real numeric cells and a cached formula value let the test exercise sheet arithmetic.
for (const [label, amount] of [
  ['Base premium', 25000],
  ['GST at 18%', 4500],
]) {
  sheet.getCell(rows.findIndex((row) => row[0] === label) + 7, 3).value =
    amount;
}
sheet.getCell(25, 3).value = { formula: 'SUM(C23:C24)', result: 29500 };
for (const row of [23, 24, 25]) sheet.getCell(row, 3).numFmt = '"INR "#,##0';
sheet.getRow(27).values = [
  '',
  'Scope',
  'One location; material damage only. No other policies or quotations form part of this test.',
];
sheet.getRow(27).height = 34;
sheet.eachRow((row, number) =>
  row.eachCell((cell) => {
    cell.font = {
      name: 'Calibri',
      size: number <= 2 ? 12 : 11,
      bold: number <= 2 || number === 6,
      color: { argb: number === 1 || number === 6 ? 'FFFFFFFF' : 'FF173047' },
    };
    cell.alignment = { vertical: 'middle', wrapText: true };
    if (number === 1 || number === 6)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF173047' },
      };
    else if (number >= 7 && number % 2)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F4F8' },
      };
  }),
);
sheet.pageSetup = {
  paperSize: 9,
  orientation: 'portrait',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 1,
  printArea: 'A1:C27',
};
await workbook.xlsx.writeFile(
  new URL('demo-placement-slip.xlsx', directory).pathname,
);
const differences = rows
  .map((row, index) => ({
    number: index + 1,
    item: row[0],
    quotation: row[1],
    policy: row[2],
    policyPage: 1,
    sheet: 'Placement Slip',
    row: index + 7,
  }))
  .filter((item) => item.quotation !== item.policy);
await writeFile(
  new URL('expected-findings.json', directory),
  JSON.stringify(
    {
      fictional: true,
      differences,
      arithmetic: {
        item: 'Total premium payable',
        expected: 29500,
        printedPolicyTotal: 29400,
        discrepancy: 100,
      },
      notes: [
        'The total sum insured difference is derived from the plant limit difference.',
        'Fire and flood wording aligns, but the monetary maximum inherits the differing total sum insured.',
        'Do not upload this answer key to the agent.',
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Generated one-page policy, one-sheet placement slip and separate answer key in testdoc/dummy.',
);
