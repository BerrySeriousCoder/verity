'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type {
  DocumentVersion,
  EvidenceBlock,
  ExtractionSummary,
} from '@verity/core';
import { api } from '../api';
import { Button } from './Button';

const PdfViewer = dynamic(
  () => import('../PdfViewer').then((module) => module.PdfViewer),
  { ssr: false },
);

function columnLabel(index: number) {
  let value = index + 1,
    label = '';
  while (value > 0) {
    value--;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function SourceViewer({
  document,
  citation,
}: {
  document: DocumentVersion;
  citation?: EvidenceBlock;
}) {
  const [extraction, setExtraction] = useState<ExtractionSummary | null>(null);
  const [unitId, setUnitId] = useState('');
  const [blocks, setBlocks] = useState<EvidenceBlock[]>([]);
  const [selected, setSelected] = useState<EvidenceBlock | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EvidenceBlock[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const unitGeneration = useRef(0);

  useEffect(() => {
    if (citation) {
      setSelected(citation);
      setUnitId(citation.unitId);
      setResults(null);
    }
  }, [citation]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const value = await api.extraction(document);
        if (stopped) return;
        setExtraction(value);
        setError('');
        setUnitId((current) => current || value.units[0]?.id || '');
        if (value.status === 'queued' || value.status === 'running')
          timer = setTimeout(() => void refresh(), 1500);
      } catch (cause) {
        if (!stopped)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load extraction.',
          );
      }
    }
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [document, attempt]);

  useEffect(() => {
    if (!unitId) return;
    unitGeneration.current++;
    let stopped = false;
    setLoading(true);
    setBlocks([]);
    void api
      .blocks(document.workspaceId, unitId)
      .then((value) => {
        if (!stopped) {
          setBlocks(value.blocks);
          setHasMore(value.hasMore);
        }
      })
      .catch((cause: unknown) => {
        if (!stopped)
          setError(
            cause instanceof Error ? cause.message : 'Could not read source.',
          );
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
      unitGeneration.current++;
    };
  }, [document.workspaceId, unitId]);

  async function search() {
    setLoading(true);
    setError('');
    try {
      const value = await api.search(document, query);
      setResults(value.blocks);
      if (value.hasMore)
        setError(
          'Showing the first 20 matches. Refine the search to narrow results.',
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  }

  const rows = blocks.filter((block) => block.anchor.kind === 'sheet');
  const columns = [
    ...new Set(
      rows.flatMap((block) =>
        block.anchor.kind === 'sheet'
          ? block.anchor.cells.map((cell) => cell.column)
          : [],
      ),
    ),
  ].sort((a, b) => a - b);
  return (
    <section className="min-w-0" aria-label="Source explorer">
      {document.format === 'pdf' ? (
        <PdfViewer
          document={document}
          {...(selected?.anchor.kind === 'pdf'
            ? { anchor: selected.anchor }
            : {})}
        />
      ) : (
        <div className="p-5">
          <div className="mb-4 flex justify-between gap-3">
            <h2 className="text-sm font-semibold">{document.filename}</h2>
            <a
              className="text-xs text-emerald-800 underline"
              href={api.fileUrl(document)}
              download={document.filename}
            >
              Download original
            </a>
          </div>
          <div className="max-h-120 overflow-auto rounded border border-stone-200">
            <table
              className="w-full border-collapse text-left text-xs"
              aria-label="Spreadsheet cells"
            >
              <thead className="sticky top-0 bg-stone-100">
                <tr>
                  <th className="p-3">Row</th>
                  {columns.map((column) => (
                    <th key={column} className="min-w-32 p-3">
                      {columnLabel(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(
                  (block) =>
                    block.anchor.kind === 'sheet' && (
                      <tr
                        key={block.id}
                        className={
                          selected?.id === block.id
                            ? 'bg-amber-100'
                            : 'border-t border-stone-100'
                        }
                      >
                        <th className="p-3 text-stone-500">
                          {block.anchor.row + 1}
                        </th>
                        {columns.map((column) => {
                          const cell =
                            block.anchor.kind === 'sheet'
                              ? block.anchor.cells.find(
                                  (item) => item.column === column,
                                )
                              : undefined;
                          return (
                            <td
                              key={column}
                              className="max-w-80 border-l border-stone-100 p-3 wrap-anywhere whitespace-pre-wrap"
                              title={
                                cell?.formula
                                  ? `Formula: ${cell.formula}`
                                  : undefined
                              }
                            >
                              {cell?.text}
                            </td>
                          );
                        })}
                      </tr>
                    ),
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Stored cell values; formulas are shown on hover and are not
            recalculated.
          </p>
        </div>
      )}
      <div className="space-y-4 border-t border-stone-200 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Source evidence</h3>
          <span className="text-xs text-stone-500">
            {extraction?.status ?? 'Loading…'}
          </span>
        </div>
        {error && (
          <p role="alert" className="text-xs text-amber-800">
            {error}{' '}
            <Button onClick={() => setAttempt(attempt + 1)}>Retry</Button>
          </p>
        )}
        {extraction?.status === 'failed' && (
          <div className="text-xs text-amber-800">
            {extraction.error}
            <Button
              onClick={() => {
                void api
                  .retryExtraction(document)
                  .then(() => setAttempt(attempt + 1))
                  .catch((cause: unknown) =>
                    setError(
                      cause instanceof Error ? cause.message : 'Retry failed.',
                    ),
                  );
              }}
            >
              Retry extraction
            </Button>
          </div>
        )}
        {!!extraction?.warnings.length && (
          <details className="text-xs text-amber-800">
            <summary>Source limitations ({extraction.warnings.length})</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {extraction.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        )}
        {!!extraction?.units.length && (
          <>
            <label className="block text-xs text-stone-500">
              Read a page or row range
              <select
                className="mt-2 block w-full rounded border border-stone-200 bg-white p-2 text-stone-800"
                value={unitId}
                onChange={(event) => {
                  setUnitId(event.target.value);
                  setResults(null);
                }}
              >
                {extraction.units.map((unit) => (
                  <option value={unit.id} key={unit.id}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </label>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
              <input
                aria-label="Search source"
                className="min-w-0 flex-1 rounded border border-stone-200 px-3 py-2 text-xs"
                placeholder="Find a clause, amount, or phrase"
                maxLength={300}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Button type="submit" disabled={!query.trim() || loading}>
                Search
              </Button>
              {results && (
                <Button type="button" onClick={() => setResults(null)}>
                  Clear
                </Button>
              )}
            </form>
            <div className="max-h-72 space-y-2 overflow-auto">
              {(results ?? blocks).map((block) => (
                <button
                  key={block.id}
                  className={`block w-full rounded border p-3 text-left text-xs leading-5 wrap-anywhere whitespace-pre-wrap ${selected?.id === block.id ? 'border-amber-300 bg-amber-50' : 'border-stone-100 hover:bg-stone-50'}`}
                  onClick={() => {
                    setSelected(block);
                    if (block.unitId !== unitId) setUnitId(block.unitId);
                  }}
                >
                  {block.text}
                </button>
              ))}
              {!loading && !(results ?? blocks).length && (
                <p className="text-xs text-stone-500">
                  No extracted text in this selection.
                </p>
              )}
            </div>
            {loading && (
              <p className="text-xs text-stone-500" role="status">
                Reading source…
              </p>
            )}
            {hasMore && !results && (
              <Button
                disabled={loading}
                onClick={() => {
                  setLoading(true);
                  const generation = unitGeneration.current;
                  void api
                    .blocks(document.workspaceId, unitId, blocks.length)
                    .then((value) => {
                      if (generation !== unitGeneration.current) return;
                      setBlocks((current) => [...current, ...value.blocks]);
                      setHasMore(value.hasMore);
                    })
                    .catch(
                      (cause: unknown) =>
                        generation === unitGeneration.current &&
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : 'Read failed.',
                        ),
                    )
                    .finally(() => {
                      if (generation === unitGeneration.current)
                        setLoading(false);
                    });
                }}
              >
                Read more blocks
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
