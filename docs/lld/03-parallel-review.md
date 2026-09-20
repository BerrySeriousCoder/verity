# Parallel review runtime and live questionnaire

Status: implemented first increment, 2026-09-20. This describes current behavior; the broader [design plan](../07-parallel-review-and-live-ledger-plan.md) retains future proposals.

## Responsibilities

`packages/agent/src/engine.ts` retains role/scope clarification, model invocation, usage accounting, retries and checkpoint handling. `parallel-review.ts` coordinates the version-2 stages. `scheduler.ts` supplies a bounded asynchronous pool and one shared model request gate per process. `parallel-contracts.ts` validates batch membership. Models propose structured content; the harness owns scheduling and acceptance.

Migration 0005 pins existing reviews to engine 1 and defaults new reviews to engine 2. Resuming an old review never silently changes its checkpoint semantics. Start a new task to use the parallel pipeline.

## Pipeline and invariants

1. Pair adjacent spreadsheet row units on the same sheet, preserving all original unit/block IDs. This normally increases packets from 30 to 60 populated rows. Keep PDFs page-based. Apply the existing character/block packet boundary afterward.
2. Schedule source packs concurrently. Each pack runs separate reviewer and auditor contexts concurrently. Each pass must account for every supplied block with an obligation or reasoned exclusion. Recoverable output/coverage failures split multi-block packets and validate the halves. Authentication/quota errors do not cause splitting.
3. Commit validated model outputs as immutable checkpoints. Publish draft raw observations into `review_checks`. Both passes must finish before the pack counts as inventoried/audited. Reading every block does not prove complete semantic extraction.
4. Group observations within document/category partitions of at most 40 members. Require every input ID exactly once; reject invented, omitted or repeated IDs. Preserve distinct conditions/entities/periods and use singleton groups when uncertain. A canonical check retains all raw members and citations. Grouping replaces its draft member rows transactionally.
5. Wait for all source packs and canonical membership checks. Compare packets of eight checks concurrently. Resolve own evidence, lexical matches and opposite-direction inventory candidates before the model call. Request exactly one decision per check ID. Allow one focused search/read follow-up for requested evidence; remaining uncertainty is visible.
6. Validate cited evidence ownership, required own citations, both document sides for alignment/difference, and source-grounded deterministic calculations when requested. Search misses and absent canonical candidates never establish `not_found`.
7. Independently verify each packet against original cited evidence and calculation results. Require one verifier result per requested ID. Combine structural and semantic gates; any failed gate yields `unverified`. Individual provisional rows cannot make the report complete.
8. Persist final packet findings, merge into serialized report snapshots, and collect user questions after independent work. Completion requires verified findings and no unresolved source limitations.

Comparison and verification overlap across packets. No global verification barrier waits for every comparison packet. Reviewer and auditor requests share the same capacity gate, so four inventory packs do not accidentally create eight simultaneous model requests.

## Persistence and recovery

- `review_work_items`: current worker state keyed by run, revision and stable worker ID; stores title, role, attempt, lease token, status and error.
- `review_checks`: authoritative current questionnaire rows, raw members, worker association, provisional/final finding; keyed by run/revision/check ID.
- Existing `review_steps`: immutable structured model and final packet checkpoints. Stable input-derived keys permit restart without regenerating committed outputs.
- Existing `review_events`: append-only model/tool activity tagged with worker ID and attempt-specific call ID. Oversized payload truncation preserves worker identity.

The existing **run lease** fences writes. This increment does not have separately claimable PostgreSQL work-item leases or a distributed queue. One process schedules a run's packets; multiple processes must not be configured as though they share a global provider semaphore. On process failure, run reclamation reconstructs scheduling from checkpoints. Stale/cancelled runs cannot update checks, workers or steps. Calls that completed remotely before checkpoint commit may repeat.

Parallel pools stop dequeuing after failure and drain active siblings before returning an error. Successful sibling checkpoints survive. Reports publish serially to avoid an older snapshot overwriting newer progress. Retry resumes unfinished work. Clarifications increment the revision and conservatively recheck conclusions while reusing pinned inventory/grouping steps.

## Provider scheduling

Default maximum: four concurrent model requests in one process, configurable with `GEMINI_MAX_CONCURRENCY`. Optional `GEMINI_RPM` and `GEMINI_INPUT_TPM` pace dispatch in a rolling minute. Input tokens are estimated conservatively from serialized request length; this is not a provider-token guarantee. Actual usage is recorded separately. An input packet exceeding configured TPM fails visibly instead of waiting forever.

A surfaced 429 halves dispatch capacity and introduces a jittered cooldown. Sustained success restores capacity gradually. SDK transport retries remain active and may perform additional provider attempts within one scheduled request. Transient surfaced HTTP failures can retry the structured step once. No application output-token cap or model-call budget was added.

Current limitations: scheduling is process-local, quota values are not auto-discovered, daily quotas are not tracked, input estimates are not reconciled with actual token counts, and there is no cross-run fairness/priority queue. Exact project quotas belong in AI Studio; do not assume the default concurrency is safe for every tier.

## Streaming and interface

SSE sends resumable activity events and committed detail snapshots. Snapshot signatures include checks and worker states, so a panel change does not depend on chat prose or a run timestamp. The UI reads checks from these records, never from partial model JSON. Snapshot delivery can lag activity by one poll; domain rows do not each emit transactional delta events in this increment.

`WorkerConversation` groups activity into one stable thread per worker. Each thread shows its own public progress summaries, tool inputs/results and status. It supports collapse, focus and independent scroll-follow. Older completed threads are paginated (20 at a time); active workers remain present. Worker activity links open the focused view even for hidden older threads.

`ReviewLedger` is a collapsible side panel with two desktop widths and full-screen mode. It supports search and status filters, paginates 40 rows, and shows original observations plus policy/quotation evidence. Citation clicks use the existing source inspector and immutable anchors. Selected canonical check IDs are reflected in the URL hash and restored on panel mount. Draft raw rows are replaced by canonical rows, so their IDs are not permanent links. Pagination is implemented, not full virtualization or drag resizing.

## Validation and remaining work

Tests exercise concurrent capacity, exact-ID coverage, forged-citation rejection, raw observation retention, process restart using saved steps, stale-lease rejection and incomplete verifier packets. Browser tests use independent ports 3100/3101 and check worker focus, questionnaire counts, full-screen details and original-source highlighting. A live Gemini smoke test uses generated PDF/CSV documents with conflicting limits.

The smoke test establishes transport/schema/runtime compatibility, not insurance accuracy or large-document speedup. Next measurements should compare the same larger fixture across serial and parallel versions: elapsed time, provider usage, raw-member coverage, canonical grouping precision, supported findings and unresolved checks.

Still outside this increment: distributed per-work leasing, exhaustive absence investigation, semantic grouping across partition boundaries, automatic PDF section packing, robust packet splitting for comparison/verifier output overflow, per-check stored calculation history in the panel, project-wide quota coordination, and full-scale evaluation. Oversized non-inventory packets currently fail visibly and preserve checkpoints; they never silently truncate the checklist.
