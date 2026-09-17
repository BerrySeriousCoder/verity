export type DocumentFormat = 'pdf' | 'csv' | 'xlsx';
export type Rectangle = [number, number, number, number];

export interface PdfAnchor {
  kind: 'pdf';
  pageIndex: number;
  rectangles: Rectangle[];
}

export interface SheetCell {
  column: number;
  text: string;
  formula?: string;
  mergedWith?: string;
}

export interface SheetAnchor {
  kind: 'sheet';
  sheet: string;
  row: number;
  cells: SheetCell[];
}

export type EvidenceAnchor = PdfAnchor | SheetAnchor;

export interface EvidenceBlock {
  id: string;
  unitId: string;
  ordinal: number;
  text: string;
  anchor: EvidenceAnchor;
}

export interface EvidenceUnit {
  id: string;
  extractionId: string;
  ordinal: number;
  label: string;
  kind: 'pdf_page' | 'sheet_rows';
  locator: Record<string, string | number | boolean | number[]>;
  warnings: string[];
}

export interface ParsedUnit {
  label: string;
  kind: EvidenceUnit['kind'];
  locator: EvidenceUnit['locator'];
  warnings: string[];
  blocks: { text: string; anchor: EvidenceAnchor }[];
}

export interface ExtractionSummary {
  id: string;
  documentId: string;
  status: 'queued' | 'running' | 'ready' | 'failed';
  error: string | null;
  warnings: string[];
  parserVersion: string;
  units: EvidenceUnit[];
}

export interface ResolvedEvidence extends EvidenceBlock {
  documentId: string;
  filename: string;
  extractionId: string;
  label: string;
}
