import { PDFDocument } from 'pdf-lib';
import { DocumentError } from '@verity/core';
import type { PdfInspector } from '@verity/core';

export const pdfInspector: PdfInspector = {
  async inspect(bytes, format = 'pdf') {
    if (format === 'csv') {
      try {
        if (
          new TextDecoder('utf-8', { fatal: true }).decode(bytes).includes('\0')
        )
          throw new Error('Binary CSV');
      } catch {
        throw new DocumentError(
          'INVALID_DOCUMENT',
          'CSV must contain UTF-8 text, not binary data.',
        );
      }
      return { pageCount: 1 };
    }
    if (format === 'xlsx') {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
        throw new DocumentError(
          'INVALID_DOCUMENT',
          'Choose a valid XLSX workbook.',
        );
      return { pageCount: 1 };
    }
    try {
      const document = await PDFDocument.load(bytes, {
        updateMetadata: false,
        throwOnInvalidObject: true,
      });
      const pageCount = document.getPageCount();
      if (pageCount < 1) throw new Error('Empty PDF.');
      return { pageCount };
    } catch {
      throw new DocumentError(
        'INVALID_PDF',
        'This PDF is invalid or password-protected. Choose an unencrypted PDF.',
      );
    }
  },
};
