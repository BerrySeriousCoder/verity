# High-level design

Status: Implemented MVP architecture; evaluation and shared-production architecture remain open.

Implemented stack: Next.js App Router with Tailwind, Fastify, PostgreSQL, a background worker, PDF.js, and the official Google GenAI SDK. Digital PDF/CSV/XLSX extraction, durable agent execution, source coverage, activity streaming, and citation navigation work locally. See ADRs [0005](decisions/0005-nextjs-tailwind-and-upload-slice.md), [0006](decisions/0006-gemini-and-durable-review.md), and [0007](decisions/0007-prompt-first-agent-workspace.md).

Foundation decision: [ADR 0004](decisions/0004-product-boundary-and-foundation.md) selects a TypeScript/pnpm workspace and PostgreSQL and establishes a review-only product. The active flow ends with verified findings, batched clarification, and the review report. No source corrections or external actions belong in the implementation.

Design input: the [correctness failure inventory](05-correctness-failure-modes.md) expands the requirements around large and heterogeneous document sets. Component LLDs map applicable failure IDs to explicit handling and acceptance tests. The supported performance envelope still needs evaluation with representative documents.

## Design stance

[ADR 0002](decisions/0002-review-scope-coverage-and-audit.md) establishes the review mechanism: clarify vague scope, build incremental inventories in both directions, independently audit coverage, match and compare provisions, and verify findings. Use a main agent role and a separate auditor role; both operate through scoped tools, with deterministic enforcement owned by the harness.

The core interaction model is an agent navigating a [document workspace](06-document-workspace.md): discover files and structure, search, read pages/regions/cell ranges, follow references, compare, and verify. Initial context contains a task and compact inventory. Whole-document reads remain available through explicit size limits and pagination. An exhaustive task adds a source and obligation coverage ledger so selective reading does not silently become selective checking.

Build one narrow application around a reusable evidence and execution core. Start with a modular monolith: separately testable modules deployed as an API and a background worker, sharing a database. Independent services are not necessary merely because responsibilities differ.

The agent proposes obligations, tool calls, and findings. Application-owned code controls evidence policies, citation validity, verification status, state transitions, and completion eligibility. The agent cannot weaken an evidence contract or mark its own unsupported result complete.

## Data flow

```text
Upload → immutable source storage → ingestion worker → evidence store
                                                          ↓
Operator prompt → API → durable workflow → agent ↔ scoped retrieval
                       ↑              ↓
                SSE activity    proposed claims + citations
                       │              ↓
                       └──── verification + calculations
                                      ↓
                              findings + review report
                                      ↕
                         citation-linked source inspector

Every stage → trace records → evaluation and inspection
```

## Component boundaries

| Component           | Owns                                                                                        | Produces                                   | Critical failure behavior                                                |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Ingestion           | File identity, embedded-text/structured parsing, extraction versions                        | Pages, blocks, table cells, provenance     | Mark partial/failed extraction; never silently treat it as complete      |
| Evidence store      | Immutable source and extraction identities, case membership                                 | Addressable evidence fragments             | Reject invalid or out-of-scope references                                |
| Document workspace  | Format-aware listing, inspection, search, reading, region viewing, and reference navigation | Bounded source-linked tool results         | Expose unprocessed scope, ambiguous references, and truncated results    |
| Coverage manager    | Source review dispositions, atomic obligations, dependencies, completion eligibility        | Coverage ledger and unresolved work queue  | Block exhaustive-completion claims when recorded scope remains unchecked |
| Retrieval           | Exact filters, lexical ranking, direct evidence/unit reads, bounded context                 | Evidence candidates and retrieval trace    | Distinguish no matches from infrastructure failure                       |
| Agent runtime       | Bounded planning and tool requests                                                          | Proposed obligations, tool calls, findings | Stop at time, token, cost, or retry limits                               |
| Verifier            | Contract checks, support assessment, applicability checks                                   | Per-check results and reasons              | Uncertainty and verifier failure cannot become success                   |
| Calculation engine  | Typed operands, currency, units, rounding rules                                             | Result plus operand provenance             | Reject incompatible units and unspecified rules                          |
| Workflow engine     | Committed phases, attempts, leases, review waits                                            | Recoverable state transitions              | Prevent concurrent workers from committing incompatible changes          |
| Conversation events | Ordered messages, public progress, steps, tools and status                                  | Resumable SSE timeline                     | Persist before display; reconnect from event ID                          |
| Review UI           | Prompt-first tasks, source inspection, issues and clarification                             | Operator decisions                         | Keep unsupported/unresolved outcomes visible                             |
| Evaluation          | Fixtures, annotations, metrics, run configuration                                           | Reproducible reports                       | Keep tuning data separate from held-out evaluation                       |

## Evidence identity and trust

A citation must resolve through `workspace → document version → extraction version → page → block/cell`. Preserve source bytes and parser provenance. Reprocessing the same file creates a new extraction version rather than changing old citation meaning.

Store page dimensions, rotation, coordinate units, and a defined origin with bounding boxes. Printed page labels and physical PDF page positions are different fields. A region inside a valid page is structurally valid, but may still fail to support the claim.

Retrieved document text is untrusted data. Instructions embedded in a PDF cannot change tool permissions, verification policy, or completion requirements. All retrieval and citation resolution must enforce workspace scope before returning evidence.

## Important corrections to the initial proposal

- A separate verifier can still make correlated model errors. Independence is an architectural boundary, not a guarantee of semantic correctness.
- Retrieval scores are relevance signals, not calibrated probabilities of truth. Avoid thresholds such as `0.97 confidence` without a definition and calibration experiment.
- Source age does not determine applicability. The relevant version may depend on the date, product, jurisdiction, or specific procedure being discussed.
- Different prices are not automatically contradictions. Compare the same entity, attribute, units, effective time, and commercial role before flagging disagreement.
- A support result is scoped to a claim, evidence set, contract version, and verifier configuration. New evidence can require re-verification.
- A structurally valid citation does not establish semantic support. A user assertion does not repair unsupported documentary evidence.
- A verified claim list is insufficient if free-form draft text introduces new factual statements. The final draft must be checked or rendered from verified material.

## Deployment and technology

| Area              | Selected approach                                                        | Reason / remaining decision                                                    |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Structured state  | PostgreSQL                                                               | Runs, leases, checkpoints, coverage, findings, questions, and ordered events   |
| Source files      | Immutable local content-addressed blobs                                  | Development adapter; object storage remains a deployment concern               |
| Retrieval         | Metadata-scoped lexical search plus direct unit/evidence/inventory reads | Establish a measured baseline before vector retrieval                          |
| Backend           | Strict TypeScript modular monolith                                       | Fastify API and worker share domain packages without separate network services |
| Parsing           | PDF.js, CSV parser, and ExcelJS-based workbook extraction                | Born-digital sources only; preserve page regions and source cells              |
| Durable workflows | PostgreSQL state machine with leases/checkpoints                         | Current single-worker design owns retry and recovery behavior                  |
| Models            | Configurable Gemini reviewer/auditor through `@google/genai`             | Exact model names and token use are pinned on each run                         |
| UI                | Next.js App Router and Tailwind                                          | Prompt-first timeline with PDF/sheet source inspector                          |

PostgreSQL provides native full-text search; this should not be described as native BM25. See the [PostgreSQL full-text search documentation](https://www.postgresql.org/docs/current/textsearch.html). Temporal is a candidate for durable orchestration; assess its deployment and programming requirements through the [official documentation](https://docs.temporal.io/).

## Run lifecycle

[ADR 0003](decisions/0003-batched-clarifications.md) defines clarification scheduling: block unresolved obligations and their dependents, finish independent checks, then present consolidated questions. Task-wide ambiguity can pause earlier. Responses resume affected work; changed premises invalidate dependent findings. User overrides remain distinct from source-verified conclusions.

Implemented run states are `queued`, `running`, `needs_context`, `needs_scope`, `needs_input`, `completed`, `failed`, and `cancelled`. Fine-grained `phase` text and checkpoints explain the current operation. Waiting states accept one durable conversational reply and enqueue a new revision. External action states do not exist because the product is review-only.

## Context and resource limits

Keep authoritative facts and workflow state outside the conversation. Assemble context from the current task, outstanding issues, compact execution state, and selected evidence. Summaries link back to evidence and are not substitutes for source material.

Bound model calls, elapsed time, retrieved tokens, tool results, retries, and spend. Budget exhaustion becomes a recorded incomplete result. Anthropic's [context engineering discussion](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) motivates selective retrieval and persistent notes; it does not establish a particular token budget for Verity.

## Remaining architecture work

Measure quality and cost on representative larger documents, then design the post-MVP evaluation runner. Shared deployment additionally requires authentication, workspace membership enforcement, object storage, hostile-file isolation, backups, operational observability, and explicit retention policy.
