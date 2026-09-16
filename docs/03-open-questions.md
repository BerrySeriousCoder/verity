# Open questions

Status: Open. Answer incrementally, not in one questionnaire.

## Current discussion

The working interface is a document review workspace with chat, persistent findings, and source inspection. Policy-versus-quotation review is the current motivating workflow. Scope clarification, bidirectional inventories, incremental reading, and independent audit are recorded in ADR 0002; do not reopen them as undecided defaults.

Resolved in ADR 0003: continue independent checks and batch questions after executable work finishes; pause early only for task-wide blockers. Resume affected work after answers, preserving unrelated findings.

Next proposal: define whether the MVP ends with a review report and follow-up clarification, or also edits source documents and performs external actions. This product boundary is not yet accepted.

Resolved: ADR 0004 defines the entire product as review-only, with no source corrections or external actions. Foundation selected during initialization: TypeScript/pnpm and local Docker PostgreSQL. Remaining stack choices include frontend/HTTP frameworks and model providers.

Later: primary language, weekly time, model/hosting budget, and packaging of the reusable core versus application.

## Subsequent design discussions

- What documents can we legally obtain and redistribute? Which will remain private fixtures?
- What complexity of digital tables belongs in the first acceptance criteria? OCR and scanned documents are excluded from the MVP by user decision.
- What does source authority mean for this specific workflow, and who defines it?
- When should missing evidence trigger another search, a question to the user, or abstention?
- Which actions are automatic, require review, or are prohibited?
- What case sizes and latency targets should we test? The idea's 50–500 pages is a proposed range, not a measured capacity.
- Does a database workflow suffice for the learning goal, or should durable orchestration itself be a major part of the project?
- How will source updates invalidate decisions and outstanding approvals?
- How do we annotate acceptable alternative citations and genuinely ambiguous outcomes?
