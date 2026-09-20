# 0006 — Gemini SDK and durable evidence review

Status: accepted and implemented; live Gemini acceptance passed 2026-09-20.

## Context

The user corrected the initial provider selection to Gemini and explicitly suggested Google's GenAI SDK. Reviews must navigate evidence incrementally, preserve coverage in both directions, survive interruptions, and collect questions after independent work.

## Decision

Use the official `@google/genai` SDK behind a typed model interface. Keep durable workflow control, source ownership, coverage validation, decimal arithmetic, and citation resolution in application code. Use PostgreSQL leases and step checkpoints within the existing modular monolith.

Reviewer and auditor calls have separate contexts. The inventory auditor sees source and agreed scope without the reviewer's result. The harness preserves the union of their obligations and removes only exact duplicates. A separate call verifies proposed findings against resolved original evidence.

## Consequences

- Model names are configurable and pinned per review. Credentials stay server-side in the ignored local `.env`.
- Search, evidence reads, page/sheet-unit inspection, inventory paging, and calculations are read-only. There are no external-action or corrected-document tools.
- Structured outputs constrain shape; they do not establish factual correctness. See [Google's structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output).
- Gemini supports a subset of JSON Schema. The provider adapter removes unsupported generation constraints while application-side Zod validation enforces the complete response contract.
- Checkpoints avoid repeating committed model work after a crash. An uncommitted remote request can repeat. Tokens from interrupted calls may be unaccounted; call and time limits provide additional bounds.
- Independent contexts do not eliminate correlated model errors. Engineering fixtures are not an agent-quality benchmark; real Gemini behavior must be validated separately.
- Clarification responses currently re-verify all findings conservatively. Fine-grained semantic dependency tracking and deduplication beyond exact matches require further work.

## Validation and revisit triggers

Unit and PostgreSQL tests cover parser boundaries, source ownership, fabricated citations, omitted source blocks, scope pausing, batched answers, stale leases, and cancellation. Browser tests cover original-source navigation, the conversation activity stream, and findings. The generated-source live test completed the real Gemini reviewer and auditor path with the local credential on 2026-09-20.

Revisit orchestration when multiple workers, larger review budgets, multi-user authorization, or external execution become required. The evaluation platform remains post-MVP.
