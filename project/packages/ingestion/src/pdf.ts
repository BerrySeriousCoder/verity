import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ParsedUnit, Rectangle } from '@verity/core';

export async function parsePdf(bytes: Uint8Array): Promise<ParsedUnit[]> {
  const loading = getDocument({
    data: Uint8Array.from(bytes),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 2000)
      throw new Error(
        'PDF exceeds the 2,000-page processing limit. Split it into smaller documents.',
      );
    const units: ParsedUnit[] = [];
    let totalCharacters = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const blocks: ParsedUnit['blocks'] = [];
      let text = '';
      let rectangles: Rectangle[] = [];
      const flush = () => {
        if (text.trim())
          blocks.push({
            text: text.trim(),
            anchor: { kind: 'pdf', pageIndex: pageNumber - 1, rectangles },
          });
        text = '';
        rectangles = [];
      };
      for (const item of content.items) {
        if (!('str' in item)) continue;
        if (!item.str.trim()) {
          if (item.hasEOL) flush();
          continue;
        }
        const [a = 1, b = 0, c = 0, d = 1, x = 0, y = 0] = item.transform;
        const angle = Math.atan2(b, a);
        const height = Math.hypot(c, d) || item.height || 1;
        const ascent = (content.styles[item.fontName]?.ascent ?? 0.8) * height;
        const descent = ascent - height;
        const cos = Math.cos(angle),
          sin = Math.sin(angle);
        const corners = [
          [x - sin * descent, y + cos * descent],
          [
            x + cos * item.width - sin * descent,
            y + sin * item.width + cos * descent,
          ],
          [x - sin * ascent, y + cos * ascent],
          [
            x + cos * item.width - sin * ascent,
            y + sin * item.width + cos * ascent,
          ],
        ];
        const xs = corners.map((point) => point[0] ?? 0),
          ys = corners.map((point) => point[1] ?? 0);
        rectangles.push([
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
        ]);
        text += `${item.str} `;
        if (item.hasEOL || text.length > 1000) flush();
      }
      flush();
      totalCharacters += blocks.reduce(
        (sum, block) => sum + block.text.length,
        0,
      );
      if (totalCharacters > 15_000_000)
        throw new Error(
          'Extracted document exceeds the 15-million-character limit.',
        );
      units.push({
        kind: 'pdf_page',
        label: `Page ${pageNumber}`,
        locator: {
          pageIndex: pageNumber - 1,
          rotation: page.rotate,
          viewBox: page.view,
        },
        warnings: blocks.length
          ? []
          : [
              'No embedded text on this page. OCR is unsupported; this page requires manual inspection.',
            ],
        blocks,
      });
      page.cleanup();
    }
    return units;
  } finally {
    await loading.destroy();
  }
}
