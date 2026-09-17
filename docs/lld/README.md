# Low-level design plan

Status: implementation in progress. The original component breakdown below remains a design roadmap; the implemented runtime contracts are documented in [evidence and durable review](02-evidence-review-runtime.md).

ADR 0004 supersedes the outbound policy/approval/action LLD proposal below: remove external action execution from implementation scope. Design workspace authorization and review-state transitions within their relevant components instead. Evaluation tooling follows the MVP.

Write each design as we reach it, after discussing the HLD. Do not fill the directory with apparently finalized schemas before we settle the workflow.

User clarification adds two priority designs after evidence identity and ingestion: **document workspace tools** (listing, search, page/region/cell reads, references, pagination, and format capabilities) and **coverage management** (source dispositions, obligation inventories, dependencies, bidirectional comparisons, and completion gates). Specify these before the agent loop. Their requirements are in [the workspace design](../06-document-workspace.md).

| Order | Planned document | Questions it must resolve |
| --- | --- | --- |
| 1 | `01-evidence-model.md` | Identity, immutability, extraction versions, pages, regions, cells, provenance, access scope |
| 2 | `02-ingestion.md` | Upload contracts, parser adapters, unsupported-content handling, partial failure, deduplication, limits |
| 3 | `03-retrieval.md` | Filters, lexical/vector fusion, exact identifiers, neighbor expansion, budgets, retrieval traces |
| 4 | `04-contracts-verification.md` | Atomic claims, application-owned contracts, support/contradiction/missing outcomes, final-draft coverage |
| 5 | `05-calculations.md` | Decimal arithmetic, units, currency, tax/rounding rules, source-linked operands |
| 6 | `06-agent-context.md` | Tools, planner boundaries, context assembly, compaction, retry and spend limits |
| 7 | `07-durable-workflows.md` | Transitions, concurrency, persisted attempts, restart recovery, cancellation |
| 8 | `08-policy-approvals-actions.md` | Capability checks, approval binding, expiry, outbox, idempotency, uncertain outcomes |
| 9 | `09-review-interface.md` | Document viewer, claim inspection, conflict handling, approval changes |
| 10 | `10-tracing-evaluation.md` | Trace schemas, configuration capture, dataset formats, scorer interfaces, replay |

Partial draft available: [review interface: citation resolution and highlighting](09-review-interface.md). This specifies the source-viewer contract early because ingestion must preserve the coordinates and cell identities it requires.

Implemented: [immutable PDF upload and viewing](01-document-upload.md), followed by [evidence ingestion and durable review](02-evidence-review-runtime.md). The latter includes digital PDF/CSV/XLSX provenance, citation navigation, Gemini integration, coverage tracking, and review checkpoints. Live-model acceptance is still pending credentials.

Use the [LLD template](template.md). Drafting a dependent design may reveal a flaw in an earlier one; update the HLD and record the reason instead of treating the order as irreversible.
