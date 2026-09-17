'use client';

import { useEffect, useState } from 'react';
import type { DocumentVersion, ReviewDetail, ReviewRun } from '@verity/core';
import { api } from '../api';
import { Button } from './Button';

const field =
  'w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-700';

export function ReviewPanel({
  workspaceId,
  documents,
  onCitation,
}: {
  workspaceId: string;
  documents: DocumentVersion[];
  onCitation: (id: string) => void;
}) {
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [active, setActive] = useState('');
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [policyId, setPolicyId] = useState('');
  const [quotationIds, setQuotationIds] = useState<string[]>([]);
  const [task, setTask] = useState('');
  const [scopeDescription, setScopeDescription] = useState('');
  const [scopeCategories, setScopeCategories] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let stopped = false;
    void api
      .reviews(workspaceId)
      .then((value) => {
        if (!stopped) {
          setRuns(value.runs);
          setActive((current) => current || value.runs[0]?.id || '');
        }
      })
      .catch((cause: unknown) => {
        if (!stopped)
          setError(
            cause instanceof Error ? cause.message : 'Cannot load reviews.',
          );
      });
    return () => {
      stopped = true;
    };
  }, [workspaceId, refresh]);

  useEffect(() => {
    if (!active) {
      setDetail(null);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setDetail(null);
    async function poll() {
      try {
        const value = await api.review(workspaceId, active);
        if (stopped) return;
        setDetail(value);
        setRuns((current) =>
          current.map((run) => (run.id === value.run.id ? value.run : run)),
        );
        if (value.run.status === 'queued' || value.run.status === 'running')
          timer = setTimeout(() => void poll(), 2000);
      } catch (cause) {
        if (!stopped)
          setError(
            cause instanceof Error ? cause.message : 'Cannot load review.',
          );
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [workspaceId, active, refresh]);

  useEffect(() => {
    setScopeDescription(detail?.run.scope?.description ?? '');
    setScopeCategories(detail?.run.scope?.categories.join(', ') ?? '');
  }, [
    detail?.run.scope?.description,
    detail?.run.scope?.categories.join(', '),
  ]);

  async function act(operation: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await operation();
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  const pending =
    detail?.report?.findings.filter(
      (finding) => finding.question && !detail.run.answers[finding.id],
    ) ?? [];
  return (
    <section
      className="mb-7 rounded-xl border border-stone-200 bg-white p-5 md:p-7"
      aria-label="Document review"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Review documents
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Compare both directions, inspect evidence, and resolve open
            questions.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">
          Gemini
        </span>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-900"
        >
          {error}
        </p>
      )}
      <details open={!active} className="mb-5">
        <summary className="cursor-pointer text-sm font-medium text-emerald-800">
          Start a new review
        </summary>
        <form
          className="mt-4 grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              const value = await api.createReview(workspaceId, {
                policyId,
                quotationIds,
                task,
              });
              setActive(value.run.id);
              setAnswers({});
            });
          }}
        >
          <label className="space-y-2 text-xs text-stone-600">
            <span>Policy document</span>
            <select
              required
              className={field}
              value={policyId}
              onChange={(event) => {
                setPolicyId(event.target.value);
                setQuotationIds((current) =>
                  current.filter((id) => id !== event.target.value),
                );
              }}
            >
              <option value="">Select policy</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.filename}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="max-h-44 space-y-2 overflow-auto rounded border border-stone-200 p-3">
            <legend className="px-1 text-xs text-stone-600">
              Quotation / supporting documents
            </legend>
            {documents
              .filter((document) => document.id !== policyId)
              .map((document) => (
                <label
                  key={document.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={quotationIds.includes(document.id)}
                    onChange={(event) =>
                      setQuotationIds((current) =>
                        event.target.checked
                          ? [...current, document.id]
                          : current.filter((id) => id !== document.id),
                      )
                    }
                  />
                  {document.filename}
                </label>
              ))}
          </fieldset>
          <label className="space-y-2 text-xs text-stone-600 md:col-span-2">
            <span>What should we check?</span>
            <textarea
              className={field}
              rows={3}
              minLength={5}
              maxLength={5000}
              required
              placeholder="Check the coverage limits, extensions, exclusions, premiums, and effective dates against the quotation."
              value={task}
              onChange={(event) => setTask(event.target.value)}
            />
          </label>
          <div className="flex items-center gap-3 md:col-span-2">
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !policyId || !quotationIds.length}
            >
              Start review
            </Button>
            <p className="text-xs text-stone-500">
              A vague request gets a scope proposal before checking begins.
            </p>
          </div>
        </form>
      </details>
      {!!runs.length && (
        <label className="mb-4 block text-xs text-stone-500">
          Review history
          <select
            aria-label="Review history"
            className={`${field} mt-2`}
            value={active}
            onChange={(event) => {
              setActive(event.target.value);
              setAnswers({});
            }}
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.task.slice(0, 90)} · {run.status.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      )}
      {detail && (
        <div className="space-y-5 border-t border-stone-100 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{detail.run.phase}</p>
              <p className="mt-1 text-xs text-stone-500">
                {detail.run.status.replaceAll('_', ' ')} ·{' '}
                {detail.run.modelCalls} model calls ·{' '}
                {(
                  detail.run.inputTokens + detail.run.outputTokens
                ).toLocaleString()}{' '}
                tokens
              </p>
            </div>
            <div className="flex gap-2">
              {['failed', 'cancelled'].includes(detail.run.status) ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void act(() => api.control(workspaceId, active, 'retry'))
                  }
                >
                  Resume review
                </Button>
              ) : (
                detail.run.status !== 'completed' && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act(() => api.control(workspaceId, active, 'cancel'))
                    }
                  >
                    Cancel
                  </Button>
                )
              )}
              {detail.report && (
                <a
                  className="rounded border border-stone-200 px-3 py-2 text-xs text-emerald-800"
                  href={`/api/workspaces/${workspaceId}/reviews/${active}/report`}
                  download
                >
                  Export report
                </a>
              )}
            </div>
          </div>
          {detail.run.error && (
            <p
              role="alert"
              className="rounded bg-amber-50 p-3 text-xs text-amber-900"
            >
              {detail.run.error}
            </p>
          )}
          {detail.run.status === 'needs_scope' && (
            <form
              className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void act(() =>
                  api.scope(workspaceId, active, {
                    description: scopeDescription,
                    categories: scopeCategories
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                    confirmed: true,
                  }),
                );
              }}
            >
              <h3 className="text-sm font-medium">Confirm what to check</h3>
              <label className="block text-xs">
                Scope
                <textarea
                  required
                  minLength={5}
                  maxLength={2000}
                  className={`${field} mt-2`}
                  value={scopeDescription}
                  onChange={(event) => setScopeDescription(event.target.value)}
                />
              </label>
              <label className="block text-xs">
                Categories, separated by commas
                <input
                  required
                  className={`${field} mt-2`}
                  value={scopeCategories}
                  onChange={(event) => setScopeCategories(event.target.value)}
                />
              </label>
              <Button type="submit" variant="primary" disabled={busy}>
                Use this scope and begin
              </Button>
            </form>
          )}
          {detail.report && (
            <>
              <div className="grid gap-3 text-xs sm:grid-cols-3">
                <div className="rounded bg-stone-50 p-3">
                  Inventoried: {detail.report.inventoriedUnits}/
                  {detail.report.sourceUnits} source units
                </div>
                <div className="rounded bg-stone-50 p-3">
                  Independently audited: {detail.report.auditedUnits}/
                  {detail.report.sourceUnits}
                </div>
                <div
                  className={`rounded p-3 ${detail.report.complete ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}
                >
                  {detail.report.complete
                    ? 'All checks have verified dispositions'
                    : 'Unresolved checks or source limitations remain'}
                </div>
              </div>
              {!!detail.report.limitations.length && (
                <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
                  {detail.report.limitations.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              )}
              <div className="space-y-3">
                {detail.report.findings.map((finding) => (
                  <article
                    key={finding.id}
                    className="rounded-lg border border-stone-200 p-4"
                  >
                    <div className="mb-2 flex flex-wrap justify-between gap-2">
                      <h3 className="text-sm font-medium">{finding.title}</h3>
                      <span
                        className={`rounded px-2 py-1 text-[10px] ${finding.status === 'aligned' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}
                      >
                        {finding.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="mb-2 text-[10px] text-stone-400">
                      {finding.category} ·{' '}
                      {finding.direction === 'policy_to_quotation'
                        ? 'Policy → quotation'
                        : 'Quotation → policy'}
                    </p>
                    <p className="text-xs leading-6 whitespace-pre-wrap">
                      {finding.explanation}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-stone-500">
                      Verification: {finding.verification}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {finding.evidenceIds.map((id, index) => (
                        <Button
                          key={id}
                          variant="quiet"
                          onClick={() => onCitation(id)}
                        >
                          Source {index + 1} ↗
                        </Button>
                      ))}
                    </div>
                    {finding.userAnswer && (
                      <p className="mt-3 text-xs text-stone-500">
                        Your clarification: {finding.userAnswer} (user context)
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
          {detail.run.status === 'needs_input' && !!pending.length && (
            <form
              className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/30 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void act(() =>
                  api.answer(
                    workspaceId,
                    active,
                    Object.fromEntries(
                      Object.entries(answers).filter(([, value]) =>
                        value.trim(),
                      ),
                    ),
                  ),
                );
              }}
            >
              <h3 className="text-sm font-medium">
                Questions after independent checks
              </h3>
              <p className="text-xs text-stone-500">
                Answer what you can. Clarifications do not replace source
                evidence.
              </p>
              {pending.map((finding) => (
                <label key={finding.id} className="block text-xs leading-5">
                  {finding.question}
                  <textarea
                    className={`${field} mt-2`}
                    maxLength={3000}
                    value={answers[finding.id] ?? ''}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [finding.id]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <Button
                type="submit"
                variant="primary"
                disabled={
                  busy || !Object.values(answers).some((value) => value.trim())
                }
              >
                Apply answers and resume
              </Button>
            </form>
          )}
          <details>
            <summary className="cursor-pointer text-xs text-stone-500">
              Execution trace ({detail.trace.length} checkpoints)
            </summary>
            <ol className="mt-3 max-h-48 space-y-1 overflow-auto font-mono text-[10px] text-stone-500">
              {detail.trace.map((step) => (
                <li key={step.key}>
                  {step.role} · {step.key} ·{' '}
                  {step.inputTokens + step.outputTokens} tokens
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </section>
  );
}
