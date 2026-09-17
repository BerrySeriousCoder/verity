'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DocumentVersion, ResolvedEvidence } from '@verity/core';
import { api } from './api';
import { DocumentPanel } from './components/DocumentPanel';
import { SourceViewer } from './components/SourceViewer';
import { EmptyViewer } from './components/EmptyViewer';
import { Button } from './components/Button';
import { ReviewPanel } from './components/ReviewPanel';

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please retry.';
}

export function App() {
  const [workspace, setWorkspace] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [documents, setDocuments] = useState<DocumentVersion[]>([]);
  const [selected, setSelected] = useState<DocumentVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [citation, setCitation] = useState<ResolvedEvidence | null>(null);

  async function openCitation(id: string) {
    if (!workspace) return;
    try {
      const resolved = await api.evidence(workspace.id, id);
      let document = documents.find((item) => item.id === resolved.documentId);
      if (!document) {
        for (let offset = 0; !document; offset += 50) {
          const page = await api.documents(workspace.id, offset);
          document = page.documents.find(
            (item) => item.id === resolved.documentId,
          );
          if (!page.hasMore) break;
        }
      }
      if (!document)
        throw new Error('The cited original document is unavailable.');
      setSelected(document);
      setCitation(resolved);
      window.document
        .getElementById('source-workspace')
        ?.scrollIntoView({ behavior: 'smooth' });
    } catch (cause) {
      setError(message(cause));
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const currentWorkspace = await api.workspace();
      const result = await api.documents(currentWorkspace.id);
      if (cancelled) return;
      setWorkspace(currentWorkspace);
      setDocuments(result.documents);
      setHasMore(result.hasMore);
      setSelected(result.documents[0] ?? null);
    })()
      .catch((error: unknown) => {
        if (!cancelled) setError(message(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  async function upload(file: File) {
    if (!workspace) return;
    setError(null);
    setNotice('');
    if (file.size > 20 * 1024 * 1024) {
      setError('File must be 20 MiB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const { document } = await api.upload(workspace.id, file);
      const result = await api.documents(workspace.id);
      setDocuments(result.documents);
      setHasMore(result.hasMore);
      setSelected(document);
      setNotice(
        `${document.filename} is ready to view. Identical uploads share one stored copy.`,
      );
    } catch (error) {
      setError(message(error));
    } finally {
      setUploading(false);
    }
  }

  async function loadMore() {
    if (!workspace) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api.documents(workspace.id, documents.length);
      setDocuments((current) => [
        ...current,
        ...result.documents.filter(
          (item) => !current.some((existing) => existing.id === item.id),
        ),
      ]);
      setHasMore(result.hasMore);
    } catch (error) {
      setError(message(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="flex h-20 items-center justify-between border-b border-stone-200 bg-white px-[5%]">
        <Link
          className="flex items-center text-[27px] font-bold tracking-tighter text-emerald-950 focus-visible:outline-2 focus-visible:outline-emerald-700"
          href="/"
          aria-label="Verity home"
        >
          <span className="mr-3 grid h-9 w-8 place-items-center rounded-lg bg-emerald-950 font-serif text-2xl text-white italic">
            v
          </span>
          verity<span className="text-emerald-600">.</span>
        </Link>
        <span className="text-[10px] tracking-widest text-stone-400">
          LOCAL WORKSPACE
        </span>
      </header>
      <main className="mx-auto max-w-400 px-[5%] pt-8 pb-8 md:pt-11">
        <div className="mb-8 flex items-center justify-between gap-5">
          <div>
            <span className="text-[10px] font-semibold tracking-widest text-stone-400">
              YOUR SOURCE MATERIAL
            </span>
            <h1 className="mt-2 mb-2 text-3xl font-semibold tracking-tight">
              Document workspace
            </h1>
            <p className="text-xs leading-6 text-stone-500">
              Keep your documents together. Open the original, one page at a
              time.
            </p>
          </div>
          <span className="hidden shrink-0 rounded-full bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 sm:inline-block">
            Personal workspace
          </span>
        </div>
        {error && (
          <div
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
            role="alert"
          >
            {error}{' '}
            {!workspace && (
              <Button variant="quiet" onClick={() => setAttempt(attempt + 1)}>
                Retry connection
              </Button>
            )}
          </div>
        )}
        <p className="sr-only" role="status">
          {notice}
        </p>
        {workspace && (
          <ReviewPanel
            workspaceId={workspace.id}
            documents={documents}
            onCitation={(id) => void openCitation(id)}
          />
        )}
        <div
          id="source-workspace"
          className="grid min-h-150 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm shadow-stone-200/30 md:grid-cols-[290px_minmax(0,1fr)]"
        >
          <DocumentPanel
            documents={documents}
            {...(selected ? { selectedId: selected.id } : {})}
            canUpload={workspace !== null}
            loading={loading}
            uploading={uploading}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onUpload={upload}
            onSelect={(document) => {
              setSelected(document);
              setCitation(null);
            }}
            onLoadMore={loadMore}
          />
          {selected ? (
            <SourceViewer
              key={selected.id}
              document={selected}
              {...(citation?.documentId === selected.id ? { citation } : {})}
            />
          ) : (
            <EmptyViewer />
          )}
        </div>
      </main>
      <footer className="mx-auto flex max-w-400 justify-between gap-4 px-[5%] pb-6 text-[10px] text-stone-400">
        <span>Verity</span>
        <span>Document review, grounded in the source.</span>
      </footer>
    </div>
  );
}
