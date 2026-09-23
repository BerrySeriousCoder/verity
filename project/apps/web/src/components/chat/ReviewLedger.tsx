'use client';
import { useEffect, useState } from 'react';
import type { ReviewCheck, ResolvedEvidence } from '@verity/core';
import {
  isResolvedFinding,
  findingStatusLabel,
} from '@verity/core/review-results';
import { api } from '../../api';
import { Finding } from './Timeline';

function CheckEvidence({
  check,
  workspaceId,
  policyIds,
  onCitation,
}: {
  check: ReviewCheck;
  workspaceId: string;
  policyIds: string[];
  onCitation: (id: string) => void;
}) {
  const [sources, setSources] = useState<ResolvedEvidence[]>([]);
  const [error, setError] = useState('');
  const evidenceKey = JSON.stringify([
    ...new Set([
      ...check.members.flatMap((member) => member.evidenceIds),
      ...(check.finding?.evidenceIds ?? []),
    ]),
  ]);
  useEffect(() => {
    let stopped = false;
    setSources([]);
    setError('');
    const ids: string[] = JSON.parse(evidenceKey);
    void Promise.all(ids.map((id) => api.evidence(workspaceId, id)))
      .then((result) => {
        if (!stopped) setSources(result);
      })
      .catch(() => {
        if (!stopped)
          setError(
            'Could not load source excerpts. Reopen this check to retry.',
          );
      });
    return () => {
      stopped = true;
    };
  }, [evidenceKey, workspaceId]);
  return (
    <>
      <p role="status" className="text-xs text-amber-300">
        {error}
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {['Policy', 'Quotation'].map((role, index) => (
          <div key={role}>
            <h4 className="mb-2 text-xs font-medium text-zinc-400">
              {role} evidence
            </h4>
            {sources
              .filter(
                (source) =>
                  policyIds.includes(source.documentId) === (index === 0),
              )
              .map((source) => (
                <button
                  key={source.id}
                  onClick={() => onCitation(source.id)}
                  className="mb-2 block w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-left hover:border-emerald-700"
                >
                  <span className="mb-2 block text-[10px] text-emerald-400">
                    {source.filename} · {source.label} ↗
                  </span>
                  <span className="block text-xs leading-6 whitespace-pre-wrap text-zinc-300">
                    {source.text}
                  </span>
                </button>
              ))}
          </div>
        ))}
      </div>
    </>
  );
}

export function ReviewLedger({
  checks,
  workspaceId,
  policyIds,
  onCitation,
  onClose,
}: {
  checks: ReviewCheck[];
  workspaceId: string;
  policyIds: string[];
  onCitation: (id: string) => void;
  onClose: () => void;
}) {
  const [full, setFull] = useState(false);
  const [wide, setWide] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [grouped, setGrouped] = useState(true);
  const comparisonKey = (check: ReviewCheck) =>
    check.finding?.comparisonId
      ? `${check.finding.comparisonId}:${check.finding.status}:${check.finding.verified}`
      : check.id;
  const groups = new Map<string, ReviewCheck[]>();
  for (const check of checks) {
    const key = comparisonKey(check);
    groups.set(key, [...(groups.get(key) ?? []), check]);
  }
  useEffect(() => {
    const value = new URLSearchParams(location.hash.slice(1)).get('check');
    if (value) setSelected(value);
  }, []);
  const matching = checks.filter(
    (check) =>
      (filter === 'all' ||
        check.state === filter ||
        check.finding?.status === filter) &&
      `${check.title} ${check.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const visible = grouped
    ? [
        ...new Map(
          matching.map((check) => [comparisonKey(check), check]),
        ).values(),
      ]
    : matching;
  const pages = Math.max(1, Math.ceil(visible.length / 40));
  const currentPage = Math.min(page, pages - 1);
  const current = checks.find((check) => check.id === selected);
  function select(id: string | null) {
    setSelected(id);
    history.replaceState(
      null,
      '',
      `${location.pathname}${location.search}${id ? `#check=${encodeURIComponent(id)}` : ''}`,
    );
  }
  return (
    <aside
      aria-label="Review questionnaire"
      className={
        full
          ? 'fixed inset-0 z-20 flex flex-col bg-[#151515] p-5'
          : 'fixed inset-0 z-20 flex flex-col border-l border-zinc-800 bg-[#151515] lg:static lg:z-auto ' +
            (wide ? 'lg:w-[42rem]' : 'lg:w-96')
      }
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 p-4">
        <div>
          <h2 className="text-sm font-medium text-zinc-100">
            Review questionnaire
          </h2>
          <p className="mt-1 text-[11px] text-zinc-500">
            {checks.filter((check) => check.state === 'done').length} processed
            · {checks.length} discovered
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="hidden text-xs text-zinc-400 lg:block"
            aria-label="Resize questionnaire"
            onClick={() => setWide(!wide)}
          >
            ↔
          </button>
          <button
            className="text-xs text-zinc-400"
            aria-label={full ? 'Exit full screen' : 'Full screen questionnaire'}
            onClick={() => setFull(!full)}
          >
            {full ? '↙' : '↗'}
          </button>
          <button
            aria-label="Close questionnaire"
            className="px-2 text-zinc-400"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {current ? (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <button
              className="mb-5 text-xs text-emerald-400"
              onClick={() => select(null)}
            >
              ← All checks
            </button>
            <p className="mb-2 text-[10px] text-zinc-500">
              {current.category} · {current.state}
            </p>
            {(groups.get(comparisonKey(current))?.length ?? 0) > 1 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {groups.get(comparisonKey(current))!.map((check) => (
                  <button
                    key={check.id}
                    onClick={() => select(check.id)}
                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-emerald-400"
                  >
                    {check.direction === 'policy_to_quotation'
                      ? 'Policy → quotation'
                      : 'Quotation → policy'}{' '}
                    · {check.category}
                  </button>
                ))}
              </div>
            )}
            <h3 className="mb-4 text-base font-medium">{current.title}</h3>
            {current.applicability && (
              <p className="mb-4 text-xs leading-6 text-zinc-400">
                Applicability: {current.applicability.reason}
                {current.applicability.uncertain ? ' (uncertain)' : ''}
              </p>
            )}
            {current.finding && (
              <Finding finding={current.finding} onCitation={onCitation} />
            )}
            {!current.finding && (
              <p className="mb-4 text-xs text-zinc-400">
                {current.state === 'discovered'
                  ? 'Source observation awaiting consolidation.'
                  : 'This check is awaiting a supported conclusion.'}
              </p>
            )}
            <CheckEvidence
              check={current}
              workspaceId={workspaceId}
              policyIds={policyIds}
              onCitation={onCitation}
            />
            <details className="mt-5 rounded-lg border border-zinc-800 p-3">
              <summary className="cursor-pointer text-xs text-zinc-400">
                Original observations ({current.members.length})
              </summary>
              {current.members.map((member) => (
                <div
                  key={member.id}
                  className="mt-3 border-t border-zinc-800 pt-3 text-xs leading-6"
                >
                  <p>{member.title}</p>
                  {member.references.map((reference, index) => (
                    <p key={index} className="text-zinc-500">
                      {reference}
                    </p>
                  ))}
                </div>
              ))}
            </details>
            {current.workerId && (
              <a
                href={`#worker-${encodeURIComponent(current.workerId)}`}
                onClick={(event) => {
                  event.preventDefault();
                  window.dispatchEvent(
                    new CustomEvent('verity:focus-worker', {
                      detail: current.workerId,
                    }),
                  );
                  onClose();
                }}
                className="mt-4 inline-block text-xs text-emerald-400"
              >
                View worker activity ↗
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3 border-b border-zinc-800 p-4">
              <p className="text-[11px] leading-5 text-zinc-400">
                Mismatch means the cited policy and quotation terms disagree. It
                does not decide which document is correct.
              </p>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={grouped}
                  onChange={(event) => {
                    setGrouped(event.target.checked);
                    setPage(0);
                  }}
                />
                Group shared comparisons
              </label>
              <input
                aria-label="Search questionnaire"
                placeholder="Search checks or categories…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs outline-none focus:border-emerald-600"
              />
              <select
                aria-label="Filter questionnaire"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(0);
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs"
              >
                <option value="all">All checks</option>
                {[
                  'discovered',
                  'ready',
                  'comparing',
                  'verifying',
                  'aligned',
                  'different',
                  'not_found',
                  'unverified',
                  'needs_input',
                ].map((state) => (
                  <option key={state} value={state}>
                    {state === 'different'
                      ? 'Mismatch'
                      : state.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {!checks.length && (
                <p className="p-3 text-xs leading-6 text-zinc-500">
                  Checks will appear here as workers commit source observations.
                  Their verification status updates live.
                </p>
              )}
              {visible
                .slice(currentPage * 40, (currentPage + 1) * 40)
                .map((check) => (
                  <button
                    key={check.id}
                    onClick={() => select(check.id)}
                    className="mb-2 block w-full rounded-lg border border-zinc-800 p-3 text-left hover:border-zinc-600 hover:bg-zinc-900"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-xs leading-5 font-medium text-zinc-200">
                        {check.title}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-1 text-[9px] ${check.finding && isResolvedFinding(check.finding) ? 'bg-emerald-950 text-emerald-400' : 'bg-zinc-800 text-amber-300'}`}
                      >
                        {check.state === 'done'
                          ? check.finding
                            ? findingStatusLabel(check.finding.status)
                            : check.state
                          : check.state}
                      </span>
                    </span>
                    <span className="mt-2 block text-[10px] text-zinc-500">
                      {check.category} ·{' '}
                      {check.direction === 'policy_to_quotation'
                        ? 'Policy → quotation'
                        : 'Quotation → policy'}{' '}
                      · {check.members.length} observations
                      {grouped &&
                      (groups.get(comparisonKey(check))?.length ?? 0) > 1
                        ? ` · ${groups.get(comparisonKey(check))!.length} linked checks`
                        : ''}
                    </span>
                  </button>
                ))}
            </div>
            {pages > 1 && (
              <div className="flex justify-between border-t border-zinc-800 p-3 text-xs text-zinc-400">
                <button
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                <span>
                  {currentPage + 1} / {pages}
                </span>
                <button
                  disabled={currentPage + 1 === pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
