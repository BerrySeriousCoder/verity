'use client';

import { useEffect, useState } from 'react';
import type {
  DocumentVersion,
  ResolvedEvidence,
  ReviewCheck,
} from '@verity/core';
import { api } from '../../api';
import { SourceViewer } from '../SourceViewer';

function EvidencePane({
  title,
  sources,
  documents,
}: {
  title: string;
  sources: ResolvedEvidence[];
  documents: DocumentVersion[];
}) {
  const [selectedId, setSelectedId] = useState('');
  const selected =
    sources.find((source) => source.id === selectedId) ?? sources[0];
  const document = documents.find((file) => file.id === selected?.documentId);
  return (
    <section
      aria-label={title}
      className="min-w-0 overflow-hidden rounded-xl border border-zinc-700"
    >
      <div className="space-y-3 bg-zinc-900 p-4">
        <h4 className="text-sm font-semibold text-zinc-100">{title}</h4>
        {selected ? (
          <label className="block text-xs text-zinc-400">
            Cited passage
            <select
              aria-label={`${title} citation`}
              value={selected.id}
              onChange={(event) => setSelectedId(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-zinc-200"
            >
              {sources.map((source, index) => (
                <option key={source.id} value={source.id}>
                  {index + 1}. {source.filename} ·{' '}
                  {source.anchor.kind === 'pdf'
                    ? `Page ${source.anchor.pageIndex + 1}`
                    : `${source.anchor.sheet} · Row ${source.anchor.row + 1}`}{' '}
                  · {source.text.slice(0, 80)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-amber-300">
            No cited evidence on this side. This does not establish that the
            term is absent.
          </p>
        )}
        {selected && (
          <blockquote className="max-h-36 overflow-auto border-l-2 border-amber-400 pl-3 text-sm leading-6 whitespace-pre-wrap text-zinc-200">
            {selected.text}
          </blockquote>
        )}
      </div>
      {document && selected && (
        <div className="max-h-[65vh] overflow-auto bg-white text-stone-800">
          <SourceViewer
            key={document.id}
            document={document}
            citation={selected}
            compact
          />
        </div>
      )}
    </section>
  );
}

export function ComparisonEvidence({
  check,
  workspaceId,
  policyIds,
  quotationIds,
}: {
  check: ReviewCheck;
  workspaceId: string;
  policyIds: string[];
  quotationIds: string[];
}) {
  const [data, setData] = useState<{
    sources: ResolvedEvidence[];
    documents: DocumentVersion[];
  } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const evidenceKey = JSON.stringify([
    ...new Set(
      check.finding?.evidenceIds.length
        ? check.finding.evidenceIds
        : check.members.flatMap((member) => member.evidenceIds),
    ),
  ]);
  useEffect(() => {
    let stopped = false;
    setData(null);
    setError('');
    void (async () => {
      const sources = await Promise.all(
        (JSON.parse(evidenceKey) as string[]).map((id) =>
          api.evidence(workspaceId, id),
        ),
      );
      const missing = new Set(sources.map((source) => source.documentId));
      const documents: DocumentVersion[] = [];
      for (let offset = 0; missing.size; offset += 50) {
        const page = await api.documents(workspaceId, offset);
        if (stopped) return;
        for (const document of page.documents)
          if (missing.delete(document.id)) documents.push(document);
        if (!page.hasMore) break;
      }
      if (missing.size)
        throw new Error('A cited document could not be loaded.');
      if (!stopped) setData({ sources, documents });
    })().catch((cause: unknown) => {
      if (!stopped)
        setError(
          cause instanceof Error ? cause.message : 'Could not load evidence.',
        );
    });
    return () => {
      stopped = true;
    };
  }, [evidenceKey, workspaceId, attempt]);
  if (error)
    return (
      <div role="alert" className="p-4 text-sm text-amber-300">
        {error}{' '}
        <button
          className="ml-3 underline"
          onClick={() => setAttempt(attempt + 1)}
        >
          Retry evidence
        </button>
      </div>
    );
  if (!data)
    return (
      <p role="status" className="p-4 text-sm text-zinc-400">
        Opening both source documents…
      </p>
    );
  // Choose a relevant cited passage for initial navigation, without changing
  // the verdict or hiding the remaining citations (including headers/values).
  const terms =
    check.title
      .replace(/^\[[^\]]+\]\s*/, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const relevance = (source: ResolvedEvidence) =>
    terms.filter((term) => source.text.toLowerCase().includes(term)).length;
  const ordered = [...data.sources].sort((a, b) => relevance(b) - relevance(a));
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <EvidencePane
        title="Quotation · What was offered"
        sources={ordered.filter((source) =>
          quotationIds.includes(source.documentId),
        )}
        documents={data.documents}
      />
      <EvidencePane
        title="Policy · What was issued"
        sources={ordered.filter((source) =>
          policyIds.includes(source.documentId),
        )}
        documents={data.documents}
      />
    </div>
  );
}
