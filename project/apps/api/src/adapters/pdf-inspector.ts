import { PDFDocument } from 'pdf-lib';
import { DocumentError } from '@verity/core';
import type { PdfInspector } from '@verity/core';

export const pdfInspector: PdfInspector = {
  async inspect(bytes) {
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
