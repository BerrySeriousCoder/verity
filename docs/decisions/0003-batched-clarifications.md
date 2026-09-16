# 0003 — Continue independent checks and batch clarifications

Status: Accepted by user, 2026-09-17.

## Decision

When an item cannot be resolved, persist its question and block that item plus dependent checks. Continue independent work. Present collected questions after all currently executable checks finish. Pause the whole review early only when uncertainty invalidates task-wide scope or document selection.

## Behavior

- Keep questions linked to affected obligations, relevant evidence, and the information needed to proceed. Combine duplicate questions about the same underlying issue.
- Do not repeatedly interrupt or redirect the active review for local ambiguities. A pending-question count may remain visible without demanding a response.
- At the end of executable work, show verified findings alongside a clearly incomplete set of unresolved items and a consolidated clarification request. This is not an unqualified completed review.
- Persist the user's responses and resume affected obligations and their dependents. Preserve unrelated verified findings. If an answer changes scope, document selection, or a shared premise, invalidate and revisit every result that depends on it.
- Reverify revised findings before updating the report. If clarification is still insufficient, retain an unresolved result rather than manufacture a verdict.
- Record user assertions or overrides as user-provided information, separate from documentary evidence. A user decision to accept a discrepancy does not turn it into documentary alignment.
- A task-wide blocker, such as an ambiguous target quotation, triggers clarification before dependent review work proceeds. Unrelated preparation may continue where useful.

## Rationale and consequences

Avoid repeated interruptions while preserving correctness and visible uncertainty. Requires persistent question records, obligation dependencies, answer provenance, and selective invalidation/resumption. Exact schemas and clarification-round budgets remain open.

## Acceptance scenarios

1. A missing endorsement blocks only affected checks; other checks finish before the consolidated question is presented.
2. Multiple checks depending on that endorsement share one question.
3. A response resumes dependent checks without discarding unrelated findings.
4. A changed quotation selection invalidates all comparisons that used the previous quotation.
5. An unresolved question remains visibly unresolved; a user override is not mislabeled as source-verified agreement.

Related: [ADR 0002](0002-review-scope-coverage-and-audit.md), [workspace design](../06-document-workspace.md).
