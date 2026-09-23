'use client';
import { findingStatusLabel } from '@verity/core/review-results';

import { useMemo } from 'react';
import type { ReviewEvent, ReviewFinding } from '@verity/core';

type Item =
  | { type: 'message'; event: ReviewEvent }
  | { type: 'progress'; id: string; text: string }
  | { type: 'activity'; id: string; start: ReviewEvent; result?: ReviewEvent };

function timeline(events: ReviewEvent[]): Item[] {
  const items: Item[] = [];
  const activities = new Map<string, Extract<Item, { type: 'activity' }>>();
  const progress = new Map<string, Extract<Item, { type: 'progress' }>>();
  for (const event of events) {
    const id = event.callId ?? event.id;
    if (event.kind === 'assistant_delta') {
      let item = progress.get(id);
      if (!item) {
        item = { type: 'progress', id, text: '' };
        progress.set(id, item);
        items.push(item);
      }
      item.text =
        typeof event.data['text'] === 'string' ? event.data['text'] : '';
    } else if (['tool_start', 'step_start'].includes(event.kind)) {
      const item: Extract<Item, { type: 'activity' }> = {
        type: 'activity',
        id,
        start: event,
      };
      activities.set(id, item);
      items.push(item);
    } else if (['tool_result', 'step_result'].includes(event.kind)) {
      const item = activities.get(id);
      if (item) item.result = event;
      else items.push({ type: 'activity', id, start: event, result: event });
    } else if (event.kind === 'user' || event.kind === 'assistant')
      items.push({ type: 'message', event });
  }
  return items;
}

export function Finding({
  finding,
  onCitation,
}: {
  finding: ReviewFinding;
  onCitation: (id: string) => void;
}) {
  return (
    <article className="my-3 border-l-2 border-zinc-600 pl-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-zinc-100">{finding.title}</h3>
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${finding.status === 'aligned' ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950/60 text-amber-300'}`}
        >
          {findingStatusLabel(finding.status)}
        </span>
      </div>
      <p className="mt-2 leading-7 text-zinc-300">{finding.explanation}</p>
      <details className="mt-2 text-xs text-zinc-400">
        <summary className="cursor-pointer">
          Verification ·{' '}
          {finding.direction === 'policy_to_quotation'
            ? 'policy → quotation'
            : 'quotation → policy'}
        </summary>
        <p className="mt-2 leading-6">{finding.verification}</p>
      </details>
      <div className="mt-2 flex flex-wrap gap-2">
        {finding.evidenceIds.map((id, index) => (
          <button
            key={id}
            onClick={() => onCitation(id)}
            className="rounded border border-zinc-700 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:border-zinc-400 hover:text-white"
          >
            Source {index + 1} ↗
          </button>
        ))}
      </div>
    </article>
  );
}

export function Timeline({
  events,
  working,
  onCitation,
}: {
  events: ReviewEvent[];
  working: boolean;
  onCitation: (id: string) => void;
}) {
  const items = useMemo(() => timeline(events), [events]);
  return (
    <div className="space-y-5" aria-label="Conversation activity">
      {items.map((item) => {
        if (item.type === 'progress')
          return (
            <p
              key={`progress-${item.id}`}
              className="pl-1 text-sm leading-7 whitespace-pre-wrap text-zinc-400"
            >
              {item.text}
            </p>
          );
        if (item.type === 'activity')
          return (
            <details
              key={`activity-${item.start.id}`}
              className="group rounded-lg border border-zinc-800 bg-zinc-950/30 font-mono text-xs"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
                <span
                  className={
                    item.result?.data['error']
                      ? 'text-rose-400'
                      : item.result
                        ? 'text-emerald-400'
                        : working
                          ? 'animate-pulse text-amber-300'
                          : 'text-zinc-500'
                  }
                >
                  {item.result?.data['error']
                    ? '!'
                    : item.result
                      ? '✓'
                      : working
                        ? '●'
                        : '○'}
                </span>
                <span className="min-w-0 flex-1 truncate text-zinc-300">
                  {item.start.title}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {item.result?.data['error']
                    ? item.result.data['retrying']
                      ? 'retrying'
                      : 'failed'
                    : item.result
                      ? 'done'
                      : working
                        ? 'running'
                        : 'interrupted'}
                </span>
                <span className="text-zinc-600 transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <div className="space-y-3 border-t border-zinc-800 p-3">
                <div>
                  <p className="mb-1 text-[10px] text-zinc-500">INPUT</p>
                  <pre className="max-h-52 overflow-auto text-[11px] leading-5 wrap-anywhere whitespace-pre-wrap text-zinc-400">
                    {JSON.stringify(item.start.data, null, 2)}
                  </pre>
                </div>
                {item.result && (
                  <div>
                    <p className="mb-1 text-[10px] text-zinc-500">OUTPUT</p>
                    <pre className="max-h-64 overflow-auto text-[11px] leading-5 wrap-anywhere whitespace-pre-wrap text-zinc-300">
                      {JSON.stringify(item.result.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          );
        const event = item.event;
        if (event.kind === 'user')
          return (
            <div
              key={event.id}
              className="ml-auto max-w-[92%] rounded-2xl bg-zinc-800 px-5 py-3 text-sm leading-7 wrap-anywhere whitespace-pre-wrap text-zinc-100"
            >
              {String(event.data['text'] ?? '')}
            </div>
          );
        const finding = event.data['finding'] as ReviewFinding | undefined;
        const questions = event.data['questions'] as
          { id: string; title: string; question: string }[] | undefined;
        return (
          <div key={event.id} className="text-sm leading-7 text-zinc-200">
            {typeof event.data['text'] === 'string' && (
              <p className="wrap-anywhere whitespace-pre-wrap">
                {event.data['text']}
              </p>
            )}
            {finding && <Finding finding={finding} onCitation={onCitation} />}{' '}
            {!!questions?.length && (
              <ol className="mt-3 list-decimal space-y-3 pl-5">
                {questions.map((question) => (
                  <li key={question.id}>
                    <strong className="font-medium">{question.title}</strong>
                    <p className="text-zinc-400">{question.question}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}
