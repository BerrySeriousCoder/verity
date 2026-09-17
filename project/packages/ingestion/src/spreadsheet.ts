import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import type { ParsedUnit, SheetCell } from '@verity/core';
import { validateWorkbookArchive } from './workbook-archive.js';

const MAX_ROWS = 100_000;
const MAX_COLUMNS = 256;
const MAX_CELL_LENGTH = 16_000;

export function columnLabel(index: number): string {
  let value = index + 1,
    label = '';
  while (value > 0) {
    value--;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function rowBlock(sheet: string, row: number, cells: SheetCell[]) {
  for (const cell of cells)
    if (cell.text.length > MAX_CELL_LENGTH)
      throw new Error('A cell exceeds the 16,000-character limit.');
  return {
    text: cells
      .map(
        (cell) =>
          `${columnLabel(cell.column)}${row + 1}: ${cell.text}${cell.formula ? ` [formula: ${cell.formula}]` : ''}`,
      )
      .join(' | '),
    anchor: { kind: 'sheet' as const, sheet, row, cells },
  };
}

function groupRows(
  sheet: string,
  blocks: ParsedUnit['blocks'],
  warnings: string[],
  hidden: boolean,
): ParsedUnit[] {
  if (!blocks.length)
    return [
      {
        kind: 'sheet_rows',
        label: `${sheet} · empty`,
        locator: { sheet, rowStart: 0, rowEnd: 0, hidden },
        warnings: ['No nonempty cells found.', ...warnings],
        blocks: [],
      },
    ];
  const units: ParsedUnit[] = [];
  for (let offset = 0; offset < blocks.length; offset += 30) {
    const batch = blocks.slice(offset, offset + 30);
    const first = batch[0]?.anchor,
      last = batch.at(-1)?.anchor;
    if (first?.kind !== 'sheet' || last?.kind !== 'sheet')
      throw new Error('Invalid sheet block.');
    units.push({
      kind: 'sheet_rows',
      label: `${sheet} · rows ${first.row + 1}–${last.row + 1}`,
      locator: { sheet, rowStart: first.row, rowEnd: last.row, hidden },
      warnings: [...warnings],
      blocks: batch,
    });
  }
  return units;
}

export async function parseSpreadsheet(
  bytes: Uint8Array,
  format: 'csv' | 'xlsx',
): Promise<ParsedUnit[]> {
  if (format === 'csv') {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0'))
      throw new Error('CSV contains binary data. Use a UTF-8 CSV file.');
    const records: string[][] = parse(text, {
      bom: true,
      skip_empty_lines: false,
      relax_column_count: true,
      max_record_size: 1_000_000,
    });
    if (records.length > MAX_ROWS)
      throw new Error('CSV exceeds 100,000 records.');
    const blocks = records.map((record, row) => {
      if (record.length > MAX_COLUMNS)
        throw new Error('CSV exceeds 256 columns.');
      return rowBlock(
        'CSV',
        row,
        record.map((value, column) => ({ column, text: value })),
      );
    });
    return groupRows('CSV', blocks, [], false);
  }
  const workbook = new ExcelJS.Workbook();
  validateWorkbookArchive(bytes);
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  const units: ParsedUnit[] = [];
  if (workbook.worksheets.length > 100)
    throw new Error('Workbook exceeds 100 sheets.');
  let rowCount = 0;
  for (const sheet of workbook.worksheets) {
    const warnings: string[] = [];
    const blocks: ParsedUnit['blocks'] = [];
    if (sheet.getImages().length)
      warnings.push('Embedded images are not interpreted.');
    sheet.eachRow((row, rowNumber) => {
      if (++rowCount > MAX_ROWS)
        throw new Error('Workbook exceeds 100,000 populated rows.');
      const cells: SheetCell[] = [];
      row.eachCell((cell, columnNumber) => {
        if (columnNumber > MAX_COLUMNS)
          throw new Error('Workbook exceeds 256 columns.');
        if (cell.isMerged && cell.master.address !== cell.address) return;
        const entry: SheetCell = { column: columnNumber - 1, text: cell.text };
        if (cell.formula) {
          entry.formula = cell.formula;
          if (cell.result === undefined)
            warnings.push(
              `Formula ${cell.address} has no cached result; formulas are not recalculated.`,
            );
        }
        if (cell.isMerged) entry.mergedWith = cell.master.address;
        cells.push(entry);
      });
      if (cells.length) blocks.push(rowBlock(sheet.name, rowNumber - 1, cells));
    });
    units.push(
      ...groupRows(
        sheet.name,
        blocks,
        [...new Set(warnings)],
        sheet.state !== 'visible',
      ),
    );
  }
  if (!units.length) throw new Error('Workbook has no worksheets.');
  return units;
}
