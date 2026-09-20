'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  DocumentVersion,
  ResolvedEvidence,
  ReviewRun,
} from '@verity/core';
import { api } from './api';
import { SourceViewer } from './components/SourceViewer';
import { Composer } from './components/chat/Composer';
import { Finding, Timeline } from './components/chat/Timeline';
import { useConversation } from './hooks/useConversation';

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Something went wrong. Please retry.';

export function App() {
  const [workspace, setWorkspace] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [documents, setDocuments] = useState<DocumentVersion[]>([]);
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [attached, setAttached] = useState<string[]>([]);
  const [selected, setSelected] = useState<DocumentVersion | null>(null);
  const [citation, setCitation] = useState<ResolvedEvidence | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [follow, setFollow] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [streamGeneration, setStreamGeneration] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const restoredActive = useRef(false);
  const { events, detail, connected } = useConversation(
    workspace?.id,
    active,
    streamGeneration,
  );
  const working = !!detail && ['queued', 'running'].includes(detail.run.status);
  const replying =
    !!detail &&
    ['needs_context', 'needs_scope', 'needs_input'].includes(detail.run.status);
  const terminal =
    !!detail &&
    ['completed', 'failed', 'cancelled'].includes(detail.run.status);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await api.workspace();
      const [files, history] = await Promise.all([
        api.documents(current.id),
        api.reviews(current.id),
      ]);
      if (cancelled) return;
      setWorkspace(current);
      setDocuments(files.documents);
      setHasMore(files.hasMore);
      setRuns(history.runs);
      setError('');
      const saved = localStorage.getItem('verity-active');
      if (saved && history.runs.some((run) => run.id === saved))
        setActive(saved);
      restoredActive.current = true;
    })().catch((cause: unknown) => {
      if (!cancelled) setError(errorMessage(cause));
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (!restoredActive.current) return;
    if (active) localStorage.setItem('verity-active', active);
    else localStorage.removeItem('verity-active');
  }, [active]);
  useEffect(() => {
    if (detail)
      setRuns((current) =>
        current.some((run) => run.id === detail.run.id)
          ? current.map((run) => (run.id === detail.run.id ? detail.run : run))
          : [detail.run, ...current],
      );
  }, [detail]);
  useEffect(() => {
    if (follow && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [events, detail, follow]);

  function newTask() {
    setActive(null);
    setDraft('');
    setAttached([]);
    setError('');
    setFollow(true);
    setSidebarOpen(false);
  }
  function openDocument(document: DocumentVersion) {
    setSelected(document);
    setCitation(null);
    setFilesOpen(false);
  }
  async function openCitation(id: string) {
    if (!workspace) return;
    try {
      const evidence = await api.evidence(workspace.id, id);
      let document = documents.find((file) => file.id === evidence.documentId);
      for (let offset = 0; !document; offset += 50) {
        const page = await api.documents(workspace.id, offset);
        document = page.documents.find(
          (file) => file.id === evidence.documentId,
        );
        if (!page.hasMore) break;
      }
      if (!document) throw new Error('The cited document is unavailable.');
      setSelected(document);
      setCitation(evidence);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function upload(files: File[]) {
    if (!workspace) return;
    setBusy(true);
    setError('');
    try {
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024)
          throw new Error(`${file.name} exceeds the 20 MiB limit.`);
        const { document } = await api.upload(workspace.id, file);
        setDocuments((current) => [
          document,
          ...current.filter((item) => item.id !== document.id),
        ]);
        setAttached((current) => [...new Set([...current, document.id])]);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!workspace || sending || working || !draft.trim()) return;
    setSending(true);
    setError('');
    try {
      if (active && replying)
        await api.message(workspace.id, active, draft.trim());
      else if (!active) {
        if (attached.length < 2)
          throw new Error(
            'Attach the policy and at least one quotation or supporting document. Describe their roles in your message.',
          );
        const { run } = await api.conversation(
          workspace.id,
          draft.trim(),
          attached,
        );
        setRuns((current) => [run, ...current]);
        setActive(run.id);
      } else
        throw new Error(
          'Start a new task for a new request. You can still inspect this conversation and its sources.',
        );
      setDraft('');
      setFollow(true);
      setFilesOpen(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }
  async function control(action: 'cancel' | 'retry') {
    if (!workspace || !active) return;
    try {
      await api.control(workspace.id, active, action);
      setStreamGeneration((current) => current + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function loadMoreFiles() {
    if (!workspace) return;
    try {
      const result = await api.documents(workspace.id, documents.length);
      setDocuments((current) => [
        ...current,
        ...result.documents.filter(
          (file) => !current.some((item) => item.id === file.id),
        ),
      ]);
      setHasMore(result.hasMore);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const attachmentIds = detail
    ? [detail.run.policyId, ...detail.run.quotationIds]
    : attached;
  const attachments = documents.filter((document) =>
    attachmentIds.includes(document.id),
  );
  return (
    <div className="flex h-dvh overflow-hidden bg-[#181818] text-zinc-200">
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        aria-label="Task navigation"
        className={`${sidebarOpen ? 'fixed inset-y-0 left-0 z-30 flex' : 'hidden'} w-60 shrink-0 flex-col border-r border-zinc-800 bg-[#121212] md:static md:flex`}
      >
        <div className="flex h-16 items-center gap-2 px-5">
          <span className="font-mono text-lg font-semibold text-zinc-100">
            verity
          </span>
          <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">
            LOCAL
          </span>
        </div>
        <button
          onClick={newTask}
          className="mx-3 flex items-center gap-3 rounded-lg border border-zinc-700 px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
        >
          <span className="text-lg">＋</span>New task
        </button>
        <div className="mt-6 min-h-0 flex-1 overflow-auto px-3">
          <p className="mb-2 px-2 text-[10px] font-medium tracking-wider text-zinc-600 uppercase">
            Recent tasks
          </p>
          {!runs.length && (
            <p className="px-2 py-3 text-xs text-zinc-600">
              Your conversations appear here.
            </p>
          )}
          {runs.map((run) => (
            <button
              key={run.id}
              title={run.task}
              onClick={() => {
                setActive(run.id);
                setDraft('');
                setError('');
                setFollow(true);
                setSidebarOpen(false);
              }}
              className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-xs ${active === run.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}
            >
              <span
                className={`size-1.5 shrink-0 rounded-full ${['queued', 'running'].includes(run.status) ? 'animate-pulse bg-amber-400' : run.status === 'failed' ? 'bg-red-400' : 'bg-zinc-600'}`}
              />
              <span className="truncate">{run.task}</span>
            </button>
          ))}
          {!!documents.length && (
            <div className="mt-7">
              <p className="mb-2 px-2 text-[10px] tracking-wider text-zinc-600 uppercase">
                Workspace files
              </p>
              {documents.map((document) => (
                <button
                  key={document.id}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                  onClick={() => openDocument(document)}
                >
                  <span className="font-mono text-[9px] uppercase">
                    {document.format}
                  </span>
                  <span className="truncate">{document.filename}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-zinc-800 px-5 py-4 text-[11px] leading-5 text-zinc-600">
          Document review agent
          <br />
          <span className="text-zinc-500">Original files stay unchanged.</span>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-800/80 px-4 md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Open navigation"
              className="text-zinc-400 md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <span className="truncate text-xs text-zinc-400">
              {detail ? detail.run.task : 'New conversation'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[10px] text-zinc-500">
            {active && (
              <span>
                {terminal
                  ? detail.run.status
                  : connected
                    ? 'Live'
                    : 'Reconnecting…'}
              </span>
            )}
            <span className="font-mono">Gemini</span>
          </div>
        </header>
        <div
          ref={viewport}
          onScroll={(event) => {
            const element = event.currentTarget;
            setFollow(
              element.scrollHeight - element.scrollTop - element.clientHeight <
                100,
            );
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8"
        >
          <div className="mx-auto w-full max-w-3xl py-8">
            {!active ? (
              <div className="flex min-h-[35vh] flex-col justify-center pb-8">
                <span className="mb-5 font-mono text-3xl text-zinc-500">
                  ›_
                </span>
                <h1 className="text-3xl font-medium tracking-tight text-zinc-100">
                  What should we check?
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-500">
                  Attach your documents and describe the task. Tell me what each
                  file is; I’ll work through the sources and show you the checks
                  as they happen.
                </p>
                <button
                  onClick={() =>
                    setDraft(
                      'The policy PDF is the final policy, and the quotation file is what was offered. Check the coverage limits, clauses, and extensions against each other in both directions.',
                    )
                  }
                  className="mt-7 max-w-lg rounded-xl border border-zinc-800 px-4 py-3 text-left text-xs leading-6 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                >
                  Compare a final policy against its quotation{' '}
                  <span className="ml-2 text-zinc-600">↗</span>
                </button>
              </div>
            ) : (
              <>
                <Timeline
                  events={events}
                  working={working}
                  onCitation={(id) => void openCitation(id)}
                />
                {!events.length && (
                  <p className="text-sm text-zinc-500">Opening conversation…</p>
                )}
                {working && (
                  <div
                    role="status"
                    className="mt-6 flex items-center gap-3 font-mono text-xs text-zinc-500"
                  >
                    <span className="size-2 animate-pulse rounded-full bg-zinc-500" />
                    {detail?.run.phase}
                  </div>
                )}
                {detail?.run.error && (
                  <div
                    role="alert"
                    className="mt-6 rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-xs leading-6 text-red-300"
                  >
                    {detail.run.error}
                  </div>
                )}
                {detail?.report && !working && (
                  <div className="mt-7 border-t border-zinc-800 pt-5">
                    <p className="font-mono text-[11px] text-zinc-500">
                      {detail.report.inventoriedUnits}/
                      {detail.report.sourceUnits} source units inventoried ·{' '}
                      {detail.report.auditedUnits} independently audited
                    </p>
                    {!detail.report.complete && (
                      <p className="mt-2 text-xs text-amber-400/80">
                        Unresolved checks or source limitations remain.
                      </p>
                    )}
                    {detail.report.limitations.map((limitation, index) => (
                      <p
                        key={index}
                        className="mt-2 text-xs leading-6 text-amber-400/70"
                      >
                        {limitation}
                      </p>
                    ))}
                    {!events.some((event) => event.data['finding']) &&
                      detail.report.findings.map((finding) => (
                        <Finding
                          key={finding.id}
                          finding={finding}
                          onCitation={(id) => void openCitation(id)}
                        />
                      ))}
                    <a
                      className="mt-4 inline-block text-xs text-zinc-400 underline underline-offset-4 hover:text-white"
                      href={`/api/workspaces/${workspace?.id}/reviews/${active}/report`}
                      download
                    >
                      Download report with evidence
                    </a>
                  </div>
                )}
                {terminal && (
                  <div className="mt-6 flex gap-3">
                    {detail?.run.status !== 'completed' && (
                      <button
                        onClick={() => void control('retry')}
                        className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        Resume task
                      </button>
                    )}
                    <button
                      onClick={newTask}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Start a new task
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 px-4 pt-2 pb-4 md:px-8">
          <div className="relative mx-auto max-w-3xl">
            {!follow && active && (
              <button
                onClick={() => setFollow(true)}
                className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
              >
                Jump to latest ↓
              </button>
            )}
            {error && (
              <p
                role="alert"
                className="mb-3 rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs leading-6 text-red-300"
              >
                {error}
                {!workspace && (
                  <button
                    className="ml-2 underline"
                    onClick={() => setAttempt(attempt + 1)}
                  >
                    Retry connection
                  </button>
                )}
              </p>
            )}
            {filesOpen && (
              <div className="absolute inset-x-0 bottom-full z-10 mb-3 max-h-72 overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-zinc-400">
                    Attach workspace files
                  </p>
                  <button
                    aria-label="Close files"
                    onClick={() => setFilesOpen(false)}
                    className="text-zinc-500"
                  >
                    ×
                  </button>
                </div>
                {documents.map((document) => (
                  <label
                    key={document.id}
                    className="flex items-center gap-3 rounded-lg p-2 text-xs hover:bg-zinc-800"
                  >
                    <input
                      type="checkbox"
                      checked={attached.includes(document.id)}
                      onChange={(event) =>
                        setAttached((current) =>
                          event.target.checked
                            ? [...current, document.id]
                            : current.filter((id) => id !== document.id),
                        )
                      }
                    />
                    <span className="truncate">{document.filename}</span>
                  </label>
                ))}
                {!documents.length && (
                  <p className="text-xs text-zinc-500">
                    Use ＋ to upload documents first.
                  </p>
                )}
                {hasMore && (
                  <button
                    className="p-2 text-xs text-zinc-400 underline"
                    onClick={() => void loadMoreFiles()}
                  >
                    Load more files
                  </button>
                )}
              </div>
            )}
            <Composer
              value={draft}
              onChange={setDraft}
              onSubmit={() => void submit()}
              onUpload={(files) => void upload(files)}
              attachments={attachments}
              onRemove={(id) =>
                setAttached((current) => current.filter((item) => item !== id))
              }
              onOpen={openDocument}
              onFiles={() => setFilesOpen(!filesOpen)}
              busy={busy || sending}
              working={working}
              disabled={
                !workspace || terminal || (!!active && !replying && !working)
              }
              onStop={() => void control('cancel')}
              replying={!!active}
            />
            <p className="mt-2 text-center font-mono text-[10px] text-zinc-600">
              {working
                ? 'Working through the sources · expand any tool call to inspect it'
                : replying
                  ? 'Reply here to continue the task'
                  : 'Enter to send · Shift + Enter for a new line'}
            </p>
          </div>
        </div>
      </main>
      {selected && (
        <aside
          aria-label="Source inspector"
          className="fixed inset-0 z-40 flex min-w-0 flex-col border-l border-zinc-700 bg-white text-stone-800 lg:static lg:z-auto lg:w-[43%] lg:max-w-2xl"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 px-4">
            <span className="text-xs font-medium text-stone-500">
              Source inspector
            </span>
            <button
              aria-label="Close source"
              onClick={() => {
                setSelected(null);
                setCitation(null);
              }}
              className="rounded p-2 text-stone-500 hover:bg-stone-100"
            >
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <SourceViewer
              key={selected.id}
              document={selected}
              {...(citation?.documentId === selected.id ? { citation } : {})}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
