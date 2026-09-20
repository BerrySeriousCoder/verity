# Architecture decision records

[0008 — Parallel reviews and individual worker threads](0008-parallel-review-and-worker-threads.md): harness-owned concurrency, batched verification, raw membership preservation, and a live questionnaire.

[0007 — Prompt-first agent workspace with durable activity](0007-prompt-first-agent-workspace.md): natural-language task entry, persisted event timeline, SSE replay, visible tools, and public progress summaries.

[0006 — Gemini SDK and durable evidence review](0006-gemini-and-durable-review.md): provider correction, role boundaries, PostgreSQL checkpoints, and correctness limits.

[0005 — Next.js, Tailwind, and the upload slice](0005-nextjs-tailwind-and-upload-slice.md): frontend explicitly selected by user; first document feature implemented.

[0004 — Review-only product and monorepo foundation](0004-product-boundary-and-foundation.md): authoritative product boundary and initial development setup; supersedes earlier outbound-action proposals.

[0001 — Exclude OCR and scanned documents from the MVP](0001-mvp-document-scope.md): accepted by user instruction.

[0002 — Scope clarification, bidirectional inventories, and independent audit](0002-review-scope-coverage-and-audit.md): accepted brainstorming direction; detailed contracts remain open.

[0003 — Continue independent checks and batch clarifications](0003-batched-clarifications.md): accepted; task-wide ambiguity may pause the review early.

Use sequential filenames such as `0001-evidence-identity.md` when a consequential choice is made. Record:

- Status: proposed, accepted, or superseded.
- Context and constraints.
- Decision in one clear sentence.
- Alternatives and why we rejected or deferred them.
- Consequences, including costs and limitations.
- Evidence or experiment supporting the choice.
- Revisit trigger and links to affected HLD/LLDs.

Do not record every implementation detail as an ADR. Use these for decisions whose rationale would otherwise be lost, such as versioning semantics, workflow engine, or approval binding.
