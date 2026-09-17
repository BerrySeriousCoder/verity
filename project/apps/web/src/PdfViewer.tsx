'use client';

import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Button } from './components/Button';
import type { DocumentVersion, PdfAnchor } from '@verity/core';
import { api } from './api';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export function PdfViewer({
  document,
  anchor,
}: {
  document: DocumentVersion;
  anchor?: PdfAnchor;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (anchor) setPage(anchor.pageIndex + 1);
  }, [anchor]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPdf(null);
    setRendering(true);
    const loading = getDocument({
      url: api.fileUrl(document),
      isEvalSupported: false,
    });
    void loading.promise
      .then((loaded) => {
        if (!cancelled) setPdf(loaded);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Unable to open this PDF. Please retry.');
          setRendering(false);
        }
      });
    return () => {
      cancelled = true;
      void loading.destroy();
    };
  }, [document, attempt]);

  useEffect(() => {
    if (!pdf || !surface.current) return;
    let cancelled = false;
    let cancelRender: (() => void) | undefined;
    const container = surface.current;
    // Each render owns its canvas; cancelled renders cannot paint a newer page.
    const canvas = window.document.createElement('canvas');
    canvas.setAttribute('aria-label', `Page ${page} of ${document.filename}`);
    canvas.setAttribute('role', 'img');
    canvas.className = 'block max-w-none shadow-md';
    container.replaceChildren();
    setRendering(true);
    setError(null);
    void (async () => {
      const pdfPage = await pdf.getPage(page);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: zoom });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable.');
      const task = pdfPage.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });
      cancelRender = () => task.cancel();
      await task.promise;
      if (!cancelled) {
        container.replaceChildren(canvas);
        if (anchor?.pageIndex === page - 1) {
          const overlay = window.document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg',
          );
          overlay.setAttribute(
            'viewBox',
            `0 0 ${viewport.width} ${viewport.height}`,
          );
          overlay.setAttribute('width', String(viewport.width));
          overlay.setAttribute('height', String(viewport.height));
          overlay.setAttribute('aria-label', 'Cited evidence highlight');
          overlay.classList.add('absolute', 'top-0', 'pointer-events-none');
          for (const box of anchor.rectangles) {
            const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(box);
            if (
              x1 === undefined ||
              y1 === undefined ||
              x2 === undefined ||
              y2 === undefined
            )
              continue;
            const rect = window.document.createElementNS(
              'http://www.w3.org/2000/svg',
              'rect',
            );
            rect.setAttribute('x', String(Math.min(x1, x2)));
            rect.setAttribute('y', String(Math.min(y1, y2)));
            rect.setAttribute('width', String(Math.max(1, Math.abs(x2 - x1))));
            rect.setAttribute('height', String(Math.max(1, Math.abs(y2 - y1))));
            rect.classList.add('fill-amber-300/40', 'stroke-amber-600');
            overlay.append(rect);
          }
          container.append(overlay);
        }
        setRendering(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setError('This page could not be rendered. Please retry.');
        setRendering(false);
      }
    });
    return () => {
      cancelled = true;
      cancelRender?.();
      canvas.remove();
    };
  }, [pdf, page, zoom, document.filename, anchor]);

  const pages = pdf?.numPages ?? document.pageCount;
  return (
    <section className="flex min-w-0 flex-col" aria-label="PDF viewer">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="min-w-0">
          <span className="text-[9px] font-semibold tracking-widest text-stone-400">
            ORIGINAL DOCUMENT
          </span>
          <h2 className="mt-2 text-sm font-medium wrap-anywhere">
            {document.filename}
          </h2>
        </div>
        <a
          className="shrink-0 text-[11px] text-emerald-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-700"
          href={api.fileUrl(document)}
          download={document.filename}
        >
          Download original ↗
        </a>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 border-y border-stone-200/80 p-2.5 text-xs">
        <Button
          aria-label="Previous page"
          disabled={!pdf || page <= 1}
          onClick={() => setPage(page - 1)}
        >
          ←
        </Button>
        <label className="text-stone-500">
          Page{' '}
          <input
            className="w-12 rounded border border-stone-200 px-1 py-1 text-center text-stone-700 focus-visible:outline-2 focus-visible:outline-emerald-700"
            aria-label="Page number"
            type="number"
            min={1}
            max={pages}
            value={page}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 1 && value <= pages)
                setPage(value);
            }}
          />{' '}
          of {pages}
        </label>
        <Button
          aria-label="Next page"
          disabled={!pdf || page >= pages}
          onClick={() => setPage(page + 1)}
        >
          →
        </Button>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <Button
          aria-label="Zoom out"
          disabled={zoom <= 0.5}
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
        >
          −
        </Button>
        <span className="min-w-10 text-center text-stone-500">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          aria-label="Zoom in"
          disabled={zoom >= 2}
          onClick={() => setZoom(Math.min(2, zoom + 0.25))}
        >
          +
        </Button>
      </div>
      <div className="h-140 overflow-auto bg-stone-100 p-4 md:h-160 md:p-6">
        {rendering && (
          <p className="text-xs text-stone-500" role="status">
            Loading page…
          </p>
        )}
        {error && (
          <div
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
            role="alert"
          >
            {error}{' '}
            <Button variant="quiet" onClick={() => setAttempt(attempt + 1)}>
              Retry
            </Button>
          </div>
        )}
        <div
          ref={surface}
          className="relative flex w-max min-w-full justify-center"
        />
      </div>
    </section>
  );
}
