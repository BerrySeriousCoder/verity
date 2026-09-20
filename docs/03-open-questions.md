# Open questions

Status: Open. Answer incrementally, not in one questionnaire.

## Current state

The implemented interface is a prompt-first document agent with durable activity, persistent findings, conversational clarification, and source inspection. Policy-versus-quotation review is the motivating workflow. Scope clarification, bidirectional inventories, incremental reading, and independent audit are recorded in ADR 0002; batched questions in ADR 0003; the review-only boundary and TypeScript/PostgreSQL foundation in ADR 0004; Next.js/Tailwind in ADR 0005; Gemini in ADR 0006; and the agent-style UI in ADR 0007.

The next design discussion should choose the first evaluation dataset envelope: representative page/row counts, policy complexity, permitted document sources, annotation process, model/cost budget, and what minimum quality makes the MVP credible.

## Subsequent design discussions

- What documents can we legally obtain and redistribute? Which will remain private fixtures?
- What complexity of digital tables belongs in the first acceptance criteria? OCR and scanned documents are excluded from the MVP by user decision.
- What does source authority mean for this specific workflow, and who defines it?
- When should missing evidence trigger another search, a question to the user, or abstention?
- Which findings require a human domain reviewer before the report can be relied upon operationally?
- What case sizes and latency targets should we test? The idea's 50–500 pages is a proposed range, not a measured capacity.
- Does a database workflow suffice for the learning goal, or should durable orchestration itself be a major part of the project?
- How should a new source version create a new review while keeping old reports and citations inspectable?
- How do we annotate acceptable alternative citations and genuinely ambiguous outcomes?
