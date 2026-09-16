# High-level design

Status: Draft — component boundaries proposed; stack not agreed.

Foundation update: [ADR 0004](decisions/0004-product-boundary-and-foundation.md) selects a TypeScript/pnpm workspace and PostgreSQL and establishes a review-only product. Outbound execution and approval branches in the initial diagrams below are superseded; the active flow ends with verified findings, batched clarification, and the review report. No source corrections or external actions belong in the implementation. Frameworks and model providers remain open.

Design input: the [correctness failure inventory](05-correctness-failure-modes.md) now expands the requirements around large and heterogeneous document sets. Component LLDs must map applicable failure IDs to explicit handling and acceptance tests. The existing shortlist is provisional until we define the document envelope.

## Design stance

[ADR 0002](decisions/0002-review-scope-coverage-and-audit.md) establishes the review mechanism: clarify vague scope, build incremental inventories in both directions, independently audit coverage, match and compare provisions, and verify findings. Use a main agent role and a separate auditor role; both operate through scoped tools, with deterministic enforcement owned by the harness.

The core interaction model is an agent navigating a [document workspace](06-document-workspace.md): discover files and structure, search, read pages/regions/cell ranges, follow references, compare, and verify. Initial context contains a task and compact inventory. Whole-document reads remain available through explicit size limits and pagination. An exhaustive task adds a source and obligation coverage ledger so selective reading does not silently become selective checking.

Build one narrow application around a reusable evidence and execution core. Start with a modular monolith: separately testable modules deployed as an API and a background worker, sharing a database. Independent services are not necessary merely because responsibilities differ.

The agent proposes claims and actions. Application-owned code controls evidence policies, verification status, state transitions, and action authorization. The agent cannot weaken an evidence contract or grant itself approval.

## Data flow

```text
Upload → immutable source storage → ingestion worker → evidence store
                                                          ↓
Operator → API → durable workflow → agent ↔ scoped retrieval
                       ↑              ↓
                       │       proposed claims + citations
                       │              ↓
                       └──── verification + calculations
                                      ↓
                              draft + review screen
                                      ↓
                         policy gate + exact-payload approval
                                      ↓
                            action adapter → recorded outcome

Every stage → trace records → evaluation and inspection
```

## Component boundaries

| Component | Owns | Produces | Critical failure behavior |
| --- | --- | --- | --- |
| Ingestion | File identity, embedded-text/structured parsing, extraction versions | Pages, blocks, table cells, provenance | Mark partial/failed extraction; never silently treat it as complete |
| Evidence store | Immutable source and extraction identities, case membership | Addressable evidence fragments | Reject invalid or out-of-scope references |
| Document workspace | Format-aware listing, inspection, search, reading, region viewing, and reference navigation | Bounded source-linked tool results | Expose unprocessed scope, ambiguous references, and truncated results |
| Coverage manager | Source review dispositions, atomic obligations, dependencies, completion eligibility | Coverage ledger and unresolved work queue | Block exhaustive-completion claims when recorded scope remains unchecked |
| Retrieval | Exact filters, lexical/semantic ranking, bounded context | Evidence candidates and retrieval trace | Distinguish no matches from infrastructure failure |
| Agent runtime | Bounded planning and tool requests | Proposed atomic claims and actions | Stop at time, token, cost, or retry limits |
| Verifier | Contract checks, support assessment, applicability checks | Per-check results and reasons | Uncertainty and verifier failure cannot become success |
| Calculation engine | Typed operands, currency, units, rounding rules | Result plus operand provenance | Reject incompatible units and unspecified rules |
| Workflow engine | Committed phases, attempts, leases, review waits | Recoverable state transitions | Prevent concurrent workers from committing incompatible changes |
| Policy and execution | Action capabilities, approval validation, dispatch | Execution record and external receipt | Reconcile unknown outcomes before retrying |
| Review UI | Source inspection, issues, exact draft review | Operator decisions | Display stale approvals and changed evidence |
| Evaluation | Fixtures, annotations, metrics, run configuration | Reproducible reports | Keep tuning data separate from held-out evaluation |

## Evidence identity and trust

A citation must resolve through `case → document version → extraction version → page → block/cell`. Preserve source bytes and parser provenance. Reprocessing the same file creates a new extraction version rather than changing old citation meaning.

Store page dimensions, rotation, coordinate units, and a defined origin with bounding boxes. Printed page labels and physical PDF page positions are different fields. A region inside a valid page is structurally valid, but may still fail to support the claim.

Retrieved document text is untrusted data. Instructions embedded in a PDF cannot change tool permissions, verification policy, or approval requirements. All retrieval and citation resolution must enforce case/access scope before returning evidence.

## Important corrections to the initial proposal

- A separate verifier can still make correlated model errors. Independence is an architectural boundary, not a guarantee of semantic correctness.
- Retrieval scores are relevance signals, not calibrated probabilities of truth. Avoid thresholds such as `0.97 confidence` without a definition and calibration experiment.
- Source age does not determine applicability. The relevant version may depend on the date, product, jurisdiction, or specific procedure being discussed.
- Different prices are not automatically contradictions. Compare the same entity, attribute, units, effective time, and commercial role before flagging disagreement.
- A support result is scoped to a claim, evidence set, contract version, and verifier configuration. New evidence can require re-verification.
- Supported evidence does not authorize action. A valid approval does not repair unsupported evidence.
- A verified claim list is insufficient if free-form draft text introduces new factual statements. The final draft must be checked or rendered from verified material.

## Deployment and technology shortlist

These are hypotheses to evaluate, not final dependencies.

| Area | Proposed direction | Reason / remaining decision |
| --- | --- | --- |
| Structured state | PostgreSQL | Transactions and relational provenance suit the core model |
| Source files | Local file adapter for development, object storage adapter later | Keep immutable binary files outside relational rows |
| Retrieval | Exact metadata filters and PostgreSQL full-text search first; evaluate vector retrieval | Establish a measurable baseline before adding retrieval infrastructure |
| Backend | Choose a primary language after discussing experience and parser needs | Python or TypeScript are candidates; avoid two runtimes without a concrete benefit |
| Parsing (no OCR in MVP) | Adapter selected through a fixture bake-off | Compare evidence coordinates, tables, failure reporting, license, latency, and cost |
| Durable workflows | Compare database-backed state machine with Temporal | Database approach has fewer deployed components but makes us own leases, retries, timers, and recovery |
| Models | Configurable generation and verification adapters | Select using measured quality and cost; record exact configurations |
| UI | Browser interface with document region inspection | Evidence inspection is central to the demonstration; framework remains open |

PostgreSQL provides native full-text search; this should not be described as native BM25. See the [PostgreSQL full-text search documentation](https://www.postgresql.org/docs/current/textsearch.html). Temporal is a candidate for durable orchestration; assess its deployment and programming requirements through the [official documentation](https://docs.temporal.io/).

## Run and action lifecycle

[ADR 0003](decisions/0003-batched-clarifications.md) defines clarification scheduling: block unresolved obligations and their dependents, finish independent checks, then present consolidated questions. Task-wide ambiguity can pause earlier. Responses resume affected work; changed premises invalidate dependent findings. User overrides remain distinct from source-verified conclusions.

Proposed run phases: `CREATED → INGESTING → RECONCILING → VERIFYING → DRAFT_READY → WAITING_REVIEW → EXECUTING → COMPLETED`, with explicit `FAILED`, `CANCELLED`, and `NEEDS_INFORMATION` outcomes. The LLD must define allowed transitions and recovery per phase; this sequence is not yet an executable state machine.

Approval binds actor, action type, destination, payload hash, evidence/decision snapshot, policy version, and expiry. Revalidate these at dispatch. Persist action intent before dispatch and use adapter-supported idempotency keys. A timeout after dispatch means the outcome may be unknown; it does not mean the action failed. Never promise exactly-once external effects without the downstream guarantees to support that claim.

## Context and resource limits

Keep authoritative facts and workflow state outside the conversation. Assemble context from the current task, outstanding issues, compact execution state, and selected evidence. Summaries link back to evidence and are not substitutes for source material.

Bound model calls, elapsed time, retrieved tokens, tool results, retries, and spend. Budget exhaustion becomes a recorded incomplete result. Anthropic's [context engineering discussion](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) motivates selective retrieval and persistent notes; it does not establish a particular token budget for Verity.

## Before accepting this HLD

Agree on the first user/workflow, representative document access, the demo's action boundary, resource constraints, and primary implementation language. Then design evidence identity first, since retrieval, verification, review, and evaluation depend on it.
