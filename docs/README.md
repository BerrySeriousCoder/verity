# Verity engineering notebook

Status: implementation and validation in progress. Digital-document extraction, source highlighting, and the Gemini-backed durable review workflow are implemented. Local parser, database, and browser tests exercise the flow; live Gemini validation is pending credentials. See [development setup](../project/README.md) and [runtime LLD](lld/02-evidence-review-runtime.md).

We will work from requirements to high-level design (HLD), then design each component in detail (LLD) before implementing it. Proposed choices are not agreed decisions.

## Reading order

1. [Product scope](01-product-scope.md): the problem, first workflow, and boundaries.
2. [HLD](02-hld.md): component responsibilities, data flow, and deployment proposal.
3. [Open questions](03-open-questions.md): choices we need to discuss next.
4. [LLD index](lld/README.md): component design order and completion criteria.
5. [Evaluation plan](04-evaluation.md): how we will measure whether this works.
6. [Decision log](decisions/README.md): why a choice was made and what it replaces.
7. [Progress journal](journal.md): what changed, what we learned, and the next discussion.
8. [Correctness failure inventory](05-correctness-failure-modes.md): large-document, mixed-format, cross-document, reasoning, and execution risks. Read this before finalizing the HLD.
9. [Document workspace and exhaustive review](06-document-workspace.md): the core agent interaction model, on-demand reading tools, and coverage tracking for policy-versus-quotation review.

## How we maintain this

- During each design discussion, update the relevant document with the conclusion, rationale, alternatives, and unresolved questions.
- Mark designs `Draft`, `Agreed`, `Implemented`, or `Superseded`. Agreement and implementation are distinct.
- Record consequential choices as architecture decision records (ADRs). Preserve old reasoning when a decision changes.
- Before implementing a component, explain its purpose with a concrete example, document its contracts and failure behavior, and identify the checks that demonstrate correctness.
- After implementation, update the design to match reality and link code and validation results. Never present a proposal as working behavior.
- Keep a short journal entry per meaningful session. The journal records progress; the design documents remain the current source of truth.
- Record external references with the specific claim they support. A vendor description or research result is not evidence that Verity works.

## Vocabulary

- **Evidence:** a versioned source fragment with provenance; it may be incorrect or inapplicable.
- **Claim:** an assertion requiring support, distinct from an insurance case.
- **Evidence contract:** application-owned rules for what support a claim requires.
- **Verification:** structural checks plus semantic assessment against those rules; not a proof of universal truth.
- **Authorization:** permission to perform a specific action; separate from whether its claims are supported.
- **Durability:** committed workflow state survives process failure.
- **Replay:** inspection or re-execution of a recorded run. Re-execution with a model need not reproduce identical output.
