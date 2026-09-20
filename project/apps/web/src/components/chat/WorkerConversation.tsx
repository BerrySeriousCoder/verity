'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReviewEvent, ReviewWorkItem } from '@verity/core';
import { Timeline } from './Timeline';

function WorkerThread({
  id,
  title,
  events,
  status,
  onCitation,
  onFocus,
}: {
  id: string;
  title: string;
  events: ReviewEvent[];
  status: string;
  onCitation: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (follow.current && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [events, open]);
  return (
    <section
      id={`worker-${encodeURIComponent(id)}`}
      aria-label={title}
      className="overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/40"
    >
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <span
          className={`size-2 shrink-0 rounded-full ${status === 'running' ? 'animate-pulse bg-emerald-400' : status === 'failed' ? 'bg-rose-400' : status === 'completed' ? 'bg-emerald-700' : 'bg-amber-400'}`}
        />
        <button
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-xs font-medium text-zinc-200">
            {title}
          </span>
          <span className="mt-1 block font-mono text-[10px] text-zinc-500">
            {status.replaceAll('_', ' ')} ·{' '}
            {
              events.filter(
                (event) =>
                  event.kind === 'tool_start' || event.kind === 'step_start',
              ).length
            }{' '}
            steps
          </span>
        </button>
        <button
          onClick={() => onFocus(id)}
          className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
          aria-label={`Focus ${title}`}
        >
          ↗ Focus
        </button>
        <button
          aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          onClick={() => setOpen(!open)}
          className="px-1 text-zinc-500"
        >
          {open ? '−' : '+'}
        </button>
      </div>
      {open && (
        <div
          ref={viewport}
          onScroll={(event) => {
            event.stopPropagation();
            const target = event.currentTarget;
            follow.current =
              target.scrollHeight - target.scrollTop - target.clientHeight < 60;
          }}
          className="max-h-96 space-y-4 overflow-y-auto p-4"
        >
          <Timeline
            events={events}
            working={status === 'running' || status === 'queued'}
            onCitation={onCitation}
          />
          {!events.length && (
            <p className="text-xs text-zinc-500">
              Waiting for a model request slot…
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function WorkerConversation({
  events,
  workers,
  working,
  onCitation,
}: {
  events: ReviewEvent[];
  workers: ReviewWorkItem[];
  working: boolean;
  onCitation: (id: string) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const [visible, setVisible] = useState(20);
  useEffect(() => {
    const focusWorker = (event: Event) =>
      setFocus((event as CustomEvent<string>).detail);
    window.addEventListener('verity:focus-worker', focusWorker);
    return () => window.removeEventListener('verity:focus-worker', focusWorker);
  }, []);
  const groups = useMemo(() => {
    const list: { id: string; worker: boolean; events: ReviewEvent[] }[] = [];
    const byWorker = new Map<string, (typeof list)[number]>();
    for (const event of events) {
      const workerId =
        typeof event.data['workerId'] === 'string'
          ? event.data['workerId']
          : null;
      if (workerId) {
        let group = byWorker.get(workerId);
        if (!group) {
          group = { id: workerId, worker: true, events: [] };
          byWorker.set(workerId, group);
          list.push(group);
        }
        group.events.push(event);
      } else {
        let group = list.at(-1);
        if (!group || group.worker) {
          group = { id: event.id, worker: false, events: [] };
          list.push(group);
        }
        group.events.push(event);
      }
    }
    for (const worker of workers)
      if (!byWorker.has(worker.id))
        list.push({ id: worker.id, worker: true, events: [] });
    return list;
  }, [events, workers]);
  const workerMap = new Map(workers.map((worker) => [worker.id, worker]));
  const title = (id: string, events: ReviewEvent[]) =>
    workerMap.get(id)?.title ??
    String(
      events.find((event) => event.data['workerTitle'])?.data['workerTitle'] ??
        events[0]?.title ??
        'Review worker',
    );
  const status = (id: string) => {
    const value = workerMap.get(id)?.status ?? 'running';
    return !working && ['running', 'queued', 'retry_wait'].includes(value)
      ? 'interrupted'
      : value;
  };
  const focused = groups.find((group) => group.id === focus);
  const completed = groups.filter(
    (group) =>
      group.worker &&
      ['completed', 'failed', 'interrupted'].includes(status(group.id)),
  );
  const shown = new Set(completed.slice(-visible).map((group) => group.id));
  return (
    <div className="space-y-5">
      {completed.length > visible && (
        <button
          className="rounded border border-zinc-700 px-3 py-2 text-xs text-zinc-400"
          onClick={() => setVisible((value) => value + 20)}
        >
          Show earlier worker threads ({completed.length - visible})
        </button>
      )}
      {groups.map((group) =>
        group.worker ? (
          ['completed', 'failed', 'interrupted'].includes(status(group.id)) &&
          !shown.has(group.id) ? null : (
            <WorkerThread
              key={group.id}
              id={group.id}
              title={title(group.id, group.events)}
              events={group.events}
              status={status(group.id)}
              onCitation={onCitation}
              onFocus={setFocus}
            />
          )
        ) : (
          <Timeline
            key={group.id}
            events={group.events}
            working={working}
            onCitation={onCitation}
          />
        ),
      )}
      {focused && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Focused worker"
          className="fixed inset-0 z-30 flex flex-col bg-zinc-950 p-5 md:inset-10 md:rounded-2xl md:border md:border-zinc-700"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setFocus(null);
          }}
        >
          <header className="mb-5 flex items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div>
              <h2 className="text-sm font-medium">
                {title(focused.id, focused.events)}
              </h2>
              <p className="mt-1 text-xs text-emerald-400">
                {status(focused.id)}
              </p>
            </div>
            <button
              autoFocus
              onClick={() => setFocus(null)}
              className="rounded border border-zinc-700 px-3 py-2 text-xs"
            >
              Back to conversation
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-3xl">
              <Timeline
                events={focused.events}
                working={status(focused.id) === 'running'}
                onCitation={onCitation}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
