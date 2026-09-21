# Progress journal

## 2026-09-20 — Gemini incomplete-response recovery

The first real policy-versus-placement review reached the quotation inventory and then stopped with a generic incomplete structured-response error. The request schema had been accepted and Gemini had streamed a public summary, so this was a terminal response-status failure rather than lack of structured-output support. The old adapter discarded the specific status, did not retry, and omitted failed-call usage.

Removed Verity's 12,000-token per-call output cap and the review-wide application token/call ceilings; Gemini now owns its native model limits. Added typed terminal statuses, one bounded retry for incomplete/budget/transient/malformed responses, separate activity identities per attempt, failed-call usage accounting, and safe worker diagnostics. Partial JSON still fails closed and is never checkpointed.

Validation includes strict type checking, the agent unit suite, and all 16 PostgreSQL integration tests. A controlled Gemini replay using the exact failed 30-row spreadsheet batch passed with 22 obligations, 8 exclusions, 2,531 input tokens, and 2,155 output tokens. This proves the repaired adapter handles that batch; it does not retroactively reveal the old call's unrecorded terminal status.

## 2026-09-20 — Prompt-first agent workspace

Replaced the role-selection dashboard flow with the intended coding-agent interaction: attach documents, describe the task and file roles in one prompt, and observe the run in one durable conversation. The agent now resolves document roles, asks for context or scope only when needed, streams bounded public progress summaries, records actual model steps and tool calls/results, renders findings inline, and opens cited originals in the source inspector. PostgreSQL owns ordered activity events and SSE replays them across reconnects and refreshes. Private model chain-of-thought is not exposed; user-facing summaries and real harness operations are distinct.

Added generic conversational replies for document-role, scope, and batched-finding questions; stop/retry controls; recent task restoration; responsive navigation; and an expandable activity timeline. Fixed a reload race that could clear the saved active task before history loaded. Removed the superseded dashboard components.

Gemini's endpoint rejected the complete Zod-generated JSON Schema for nested review outputs. Added a conservative Gemini schema adapter and retained full application-side Zod parsing as the enforcement boundary. The real Gemini smoke test now completes on generated PDF/quotation sources. Current validation: unit tests, 15 PostgreSQL integration tests, two browser tests, strict type checking, and the live Gemini reviewer/auditor path pass. The browser flow covers upload, prompt submission, streamed progress, tool inspection, findings, citation highlighting, report access, reload recovery, and mobile navigation.

Recorded [ADR 0007](decisions/0007-prompt-first-agent-workspace.md). Next product work is evaluation and larger-document quality measurement after final MVP hardening, not another dashboard workflow.

## 2026-09-17 — PDF upload and Next.js/Tailwind workspace

Built the first vertical slice: PDF structure validation, immutable original storage, PostgreSQL metadata/migrations, document listing, and a PDF.js viewer with page navigation and zoom. User explicitly selected Tailwind and Next.js during implementation; removed Vite and handwritten styles before committing. Recorded ADR 0005, updated run instructions, and added unit, PostgreSQL integration, and browser tests. Original documents are viewable but not yet extracted or reviewed. Next slice: digital text extraction with stable page/block anchors, then citation navigation.

Validation: five domain tests, six PostgreSQL integration tests, and one end-to-end browser flow passed, alongside formatting, strict types, and the optimized Next.js build. Browser coverage includes actual canvas content, page navigation, zoom, reload persistence, duplicate uploads, invalid-file feedback, and mobile overflow. Applied the initial local database migration. Updated Fastify after a dependency audit; runtime audit reports no known vulnerabilities. CI configuration includes these checks but has not run remotely.

## 2026-09-17 — Product boundary and repository initialization

User established that review/reporting is the whole product, not a temporary boundary before document correction. Authorized a production-minded monorepo in `project/` and ongoing Git commits; evaluation tooling follows the MVP. Selected TypeScript/pnpm and PostgreSQL with the installed 16-alpine image. Initialized outer Git so documents and code share history. Scaffold validation results will be recorded after checks complete.

Foundation validation: pinned dependencies installed; frozen-lockfile offline install passed; formatting and strict TypeScript checks passed. Isolated Docker PostgreSQL became healthy and a SQL query confirmed database/user `verity` on PostgreSQL 16.15. No application behavior exists yet, so no application tests were claimed. CI is configured but has not run remotely.

## 2026-09-17 — Batched clarification behavior accepted

User agreed to finish independent checks before presenting collected questions, then resolve remaining items using user input. Task-wide uncertainty may pause earlier. Recorded ADR 0003 and updated HLD/workspace behavior. Next proposed discussion: whether the MVP ends at a review report or also changes documents/performs actions.

## 2026-09-17 — Review mechanism decisions preserved

Recorded ADR 0002 from the brainstorming: clear tasks proceed without plan approval; vague requests receive concrete scope clarification; general alignment checks inventory both documents; bounded reading produces persistent atomic obligations; a separate auditor inspects source material independently before reconciling the main inventory. Coverage audit and finding verification remain distinct. Both directional inventories feed one user-facing checklist. Open next: unmatched/ambiguous outcome handling and when the agent interrupts the user.

## 2026-09-17 — MVP excludes OCR and scans

Recorded the user's explicit scope decision in ADR 0001 and updated active design documents. Focus remains born-digital PDFs, spreadsheets, and CSVs. Unsupported image-only material cannot silently count as reviewed. Next product discussion: task initiation, autonomous review, and the report the user receives.

## 2026-09-17 — Citation interaction mechanism

User asked how clicking evidence opens and highlights a PDF or sheet. Added a partial review-interface LLD covering stored anchors, authenticated resolution, immutable versions, PDF coordinate transforms, OCR mappings, spreadsheet/CSV source ranges, graceful fallbacks, and a proposed validation slice. Proposed PDF.js after checking official documentation; grid library remains unselected. No viewer has been built or tested yet.

## 2026-09-17 — Initial design notebook

Established a documentation structure and a draft HLD from the proposed Verity concept. No application code or benchmark results exist yet.

Proposals: one estimate-reconciliation workflow, a reusable evidence core, a modular monolith, and a simulated outbound action for the initial demonstration. These await discussion.

Key engineering distinctions: citations need immutable extraction identity; support differs from authorization; semantic verification remains fallible; conflicting values need matching scope; approval must bind the exact action; external timeouts can leave an unknown outcome.

Next: choose the first workflow and establish practical constraints, then refine the HLD before writing the evidence-model LLD.

## 2026-09-17 — Correctness scope expanded

User emphasized large documents, multiple documents, varied document types, and identifying the major failure modes before building. Added a 38-item failure inventory with candidate defenses and test ideas. Updated scope, HLD, and evaluation plan to make document complexity a core design input. Next discussion should define the supported document envelope and prioritize failures before selecting the stack. No defenses are implemented or validated yet.

## 2026-09-17 — On-demand document workspace clarified

User described repository-style navigation for documents: list, search, read whole files or selected pages/regions, gather context iteratively, plan, act, and verify. Their concrete example is exhaustive final-policy versus quotation comparison across PDFs, sheets, and CSVs. Added the workspace interaction design and separate source/obligation coverage ledgers. Clarified that exhaustive source inspection can be batched without fitting all documents into one context, and that policy-to-quotation comparison differs from checking quotation promises missing from the policy. No tool interfaces are implemented yet.

## 2026-09-17 — Evidence and review implementation

- Added digital PDF region extraction, CSV/XLSX row/cell provenance, durable extraction leases, source navigation and highlighting. Original bytes remain immutable.
- Selected Gemini with the official Google GenAI SDK after the user's provider correction. Added typed structured responses, independent inventory contexts, deterministic coverage/citation checks and decimal computation.
- Implemented PostgreSQL review checkpoints, scope clarification, bidirectional inventory, bounded evidence investigation, independent finding verification, cancellation/resume, batched questions, and report export.
- Added engineering tests for false citations, missed blocks, database isolation, worker lease recovery, and browser evidence navigation. Real Gemini behavior is not yet validated because no local API key is configured.
- Preserved obligations from both inventory passes by deterministic union; model reconciliation must not silently erase obligations. Fine-grained answer dependency invalidation remains conservative (reverify all findings).

Validation at this milestone: `pnpm check` passed (12 unit tests, strict types, formatting, Next.js production build); all 14 PostgreSQL integration tests and both browser tests passed. Production dependency audit reports no known vulnerabilities after the ExcelJS UUID override. Browser exports include resolved original source excerpts and anchors. Live-model test: not run; `GEMINI_API_KEY` is absent.

Git milestones: `3c5f134` adds the evidence/review backend; `29d953a` adds the review workspace and citation navigation. Next acceptance step: configure the local credential, run `pnpm test:live`, resolve any model-specific failures, and update this record with the actual outcome.

## 2026-09-20 — Parallel review and individual live worker threads

Implemented engine version 2 for new reviews: shared request scheduling, paired spreadsheet units, concurrent independent inventories/audits, canonical membership validation, eight-check comparison packets, and independent batched verification. Raw observations remain inspectable. Existing engine-1 runs retain their checkpoints. Applied additive migration 0005 locally.

Each worker has its own live activity thread with tools, progress, collapse and focus. Added a collapsible/wider/fullscreen questionnaire with live states, search/filtering, original observations, policy/quotation evidence, and links to worker activity. Browser tests now use separate ports and build output so a running development stack does not need to be stopped.

Validation: formatting, strict types, unit tests and production build passed; 22 PostgreSQL integration tests passed, including concurrent packet fan-in, raw-member preservation, invalid citations, omitted verifier IDs and restart recovery. Both browser tests passed. The generated PDF/CSV live Gemini smoke test completed with verified conflicting limits in 11 calls (12,170 reported input tokens; 2,135 output tokens). This is runtime compatibility evidence, not a measured large-document speedup or accuracy benchmark.

See ADR 0008 and the parallel runtime LLD for implementation boundaries: scheduling is process-local and fenced by the run lease, absence claims remain unverified without exhaustive evidence, and comparison/verifier overflow splitting remains follow-up work. No application output-token budget was added. User-authored JavaScript/TypeScript snippet documents were left untouched.

## 2026-09-21 — Recover malformed comparison and verification batches

Inspected local failure metadata: comparison packet 7 failed exact-ID validation in the 834-check review; 44/44 referred to source units, not completed comparisons. Added typed membership diagnostics, recursive packet splitting, checkpointed child-result recovery, and explicit unverified singleton outcomes so model formatting failures do not stop unrelated checks. Clarified source/check counters and unresolved status styling. Added regression coverage for successful smaller-batch recovery and persistent verifier omissions. The user's failed review was not automatically restarted or sent to Gemini.
