# ADR 0008: Harness-scheduled parallel reviews and individual worker threads

Status: accepted by user and implemented as a first increment, 2026-09-20.

## Context

A large serial review ran for hours. The user requested batched inventories/comparisons/verifications and a live questionnaire panel, then explicitly rejected presenting all parallel agents inside one aggregate card. Every worker must retain its own observable progress and tool stream.

## Decision

Use deterministic harness code to schedule bounded parallel model requests, preserve raw observations under canonical checks, and expose each worker as a separate live thread alongside a committed questionnaire panel.

The harness, not a manager LLM, owns concurrency. Reviewer and auditor roles share the same request gate. Independent auditors retain separate contexts. Model output never decides its own acceptance without structural validation and independent verification.

## Alternatives and consequences

Unbounded Promise.all would ignore project quotas and complicate failure recovery. A manager LLM would add latency and could not reliably enforce those quotas. One combined card would reduce visual detail the user explicitly wants. A separate workflow platform is deferred while the modular monolith can coordinate each run using its existing PostgreSQL lease.

Existing reviews remain on their pinned engine version. New reviews batch comparison/verification and require exact membership at every fan-in boundary. Raw evidence survives consolidation. A search miss or absent checklist member does not establish documentary absence.

This increment uses process-local concurrency and run-level lease fencing; distributed per-task leasing is deferred. Four request slots and eight-check packets are initial settings, not measured optimal values. No token-output ceiling was introduced.

## Evidence and revisit conditions

PostgreSQL tests exercise parallel requests, membership preservation, forged citations, incomplete verifier output, and restart recovery. Browser tests exercise individual focused workers and the fullscreen questionnaire with citations. The live generated-document Gemini check passes. None establishes large-document semantic accuracy or a specific speedup.

Revisit packet sizes and concurrency using a larger reviewed fixture. Add distributed quota coordination before horizontal worker scaling. See [runtime LLD](../lld/03-parallel-review.md) for the actual implementation contract and limitations.
