# Evidence ingestion and durable review runtime

Status: implemented and validated through unit, PostgreSQL, browser, and live Gemini checks. Provider: Gemini through the official `@google/genai` SDK (user decision).

## Product acceptance path

1. Extract digital PDF text and bounding regions; parse CSV records and XLSX sheet/cell values without OCR or formula execution.
2. Expose versioned document inspection, bounded reading, search, and original-source highlighting through shared evidence identities.
3. Accept one prompt with attached documents. Resolve file roles from the prompt and bounded previews; ask in the conversation when roles or scope are ambiguous, and automatically run clear requests.
4. Persist incremental source inventories in both directions. A fresh-context auditor independently inspects source units before a deterministic union preserves obligations from both inventories. Only exact duplicates are collapsed.
5. Match and compare obligations through bounded evidence tools, deterministic calculations, and independent finding verification.
6. Finish independent checks and batch unresolved questions. Conservatively re-verify findings on answers without relabeling user assertions as documentary proof.
7. Present coverage, findings, evidence, unresolved items, and a downloadable review report. Support cancellation, retry, and process restart.

## Persistence and execution

PostgreSQL stores source extractions, units, blocks, review runs, step checkpoints, findings, questions, messages, and traces. Originals and extraction identities remain immutable. API requests enqueue work; a background worker owns parsing and model execution.

Claim queued work using row locks and a lease token. Heartbeat leases during long work. Every checkpoint commit checks the active lease token and run state, preventing stale workers from committing after reclamation or cancellation. A crash can repeat an uncommitted model call, but committed step output is reused. Bound attempts, context, calls, tokens, and wall time; exhaustion yields an explicit incomplete state.

Each source unit has an inventory disposition. Empty/unreadable PDF pages and unsupported workbook content are visible extraction gaps, not evidence of absent clauses. A unit may contain multiple evidence blocks. Inventory records source IDs, atomic obligations, continuation references, and out-of-scope explanations.

## Agent boundaries

Use the Google GenAI SDK behind a typed model interface with schema-validated results. Reviewer, independent inventory auditor, and finding verifier use separate contexts. Tool arguments are validated and constrained to the run's pinned document set. Source content is untrusted; it cannot modify tool permissions, agreed scope, or completion rules.

The runtime controls full-scope inventory progression; the model navigates related evidence using bounded read/search tools. Search results never establish global absence. Counterpart inventories support bidirectional comparison and one-to-many matches. Store citations as actual evidence IDs; never accept invented page coordinates.

## UI and completion

Next.js/Tailwind provides a prompt-first agent workspace, durable task history, streamed public progress, expandable model/tool activity, findings, batched questions, and source navigation. PostgreSQL `review_events` are replayed over SSE; a browser refresh does not discard the timeline. PDF and sheet views share citation resolution. A report is complete only when required source units and obligations have terminal verified dispositions with no unreported gaps. A completed review may contain discrepancies; user acceptance of a discrepancy does not turn it into alignment.

The stream exposes concise `publicSummary` text requested from each model call and the actual application tool arguments/results. It does not expose or claim to reconstruct private model chain-of-thought. Structured model results are checkpointed separately and validated before they affect run state.

Engineering tests use generated fixtures and a deterministic model test double to exercise orchestration, not to claim model quality. Live Gemini testing is required before claiming the model-backed flow works. The benchmark/evaluation platform remains post-MVP.

## Current implementation limits

The API is a local single-user service, not a shared production deployment. Coverage accounts for source blocks, not a mathematical proof that all semantic obligations were found. The auditor uses an independent context; model families can still make correlated errors. No confidence score is presented as calibrated probability.

The read-only investigation has search, evidence lookup, opposite-inventory paging, and source-linked decimal calculations. It has no external web research or write tools. Source-side absence is never inferred from a search miss. The fixed tool-step budget can leave large comparisons unresolved.

Answers currently invalidate every finding conservatively; reliable fine-grained semantic dependency tracking is deferred. Findings remain individually traceable in both directions, including possible near-duplicates from independent inventories. Sheet highlights identify the source row/cells; formulas use saved results only. Only UTF-8 comma-delimited CSV is accepted. Public hostile-file isolation is not implemented.

## Validation separation

Generated fixtures and a deterministic model double exercise two-sided inventory, role and scope pausing, citation fabrication rejection, coverage failure, cancellation, PostgreSQL lease ownership, event replay, and browser citation navigation. They are not measurements of real model accuracy. The live smoke test establishes API/runtime compatibility with Gemini on generated sources; it is not an accuracy benchmark.
