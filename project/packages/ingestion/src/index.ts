import { parsePdf } from './pdf.js';
import { parseSpreadsheet } from './spreadsheet.js';
import type { DocumentFormat, ParsedUnit } from '@verity/core';

export async function extractDocument(
  bytes: Uint8Array,
  format: DocumentFormat,
): Promise<ParsedUnit[]> {
  return format === 'pdf' ? parsePdf(bytes) : parseSpreadsheet(bytes, format);
}
