# Product scope

Status: Draft — proposed starting point for discussion.

Authoritative update: [ADR 0004](decisions/0004-product-boundary-and-foundation.md) establishes a review-only product. The product produces findings/reports and resolves clarifications; it never corrects source documents or performs outbound actions. Earlier action-related proposals below are superseded and retained only as brainstorming history. Policy-versus-quotation is the current example workflow. Evaluation infrastructure follows the MVP; engineering testing accompanies implementation.

## Problem

Document agents can produce a plausible result while citing the wrong page, using an obsolete source, making an arithmetic error, or performing an unauthorized action. Verity should make these failures visible and enforce explicit rules at the boundary between proposed claims and executable actions.

The central requirement is correctness across large documents, heterogeneous document structures, and multiple related documents. The first workflow is a demonstration of this requirement, not a reason to restrict evaluation to small, clean files. See the [failure inventory](05-correctness-failure-modes.md) before choosing implementation components. Exact supported formats and scale remain to be agreed.

## Proposed first workflow

Latest user clarification: the core product is an agent that navigates uploaded PDFs, sheets, and CSVs on demand. The user's motivating workflow is checking every relevant clause/extension in a final policy against a quotation. See the [document workspace design](06-document-workspace.md) for this walkthrough and its completeness requirements. The estimate example below remains an earlier candidate, not a selected domain.

An operator uploads an original estimate, a revised estimate, and supporting technical documents for one case. Verity identifies line-item differences, builds atomic claims explaining discrepancies, attaches inspectable evidence, checks calculations and support, and produces a reviewable draft. The operator sees unresolved issues and can approve an exact draft for a simulated outbound action.

Example: one estimate lists two units at $125 each; the other lists $300 for that line. The system should identify the $50 difference, cite both rows, and distinguish an arithmetic discrepancy from a justified price revision. Price disagreement alone does not establish that either estimate is wrong.

## Initial boundaries

Proposed first release:

- One workflow and one operator-facing review screen.
- Born-digital PDFs with usable embedded text, spreadsheets, and CSVs. OCR and scanned-document processing are explicitly out of scope for the MVP (user decision). Unsupported image-only content must not silently count as reviewed.
- Immutable document versions, page/block citations, exact decimal calculations, verification results, and recorded workflow transitions.
- Pause/resume for review, with restart recovery demonstrated.
- A simulated outbound adapter that exercises approval enforcement without integrating a real mailbox.
- A small, inspectable benchmark developed alongside the system.

Later candidates: broad file-format support, production external communication, computer use, multi-domain policy packs, complex multi-user roles, and extensive source connectors. These remain part of the direction, not prerequisites for the first end-to-end demonstration.

## Acceptance scenarios

1. A correct reconciliation includes clickable evidence for every material factual claim.
2. A nonexistent citation or incorrect total fails verification.
3. Missing or conflicting evidence produces an explicit unresolved result.
4. Restarting a worker preserves committed progress and pending review.
5. An outbound action without valid approval is blocked at execution time.
6. Editing an approved payload invalidates that approval.
7. A timed-out action is reconciled before a potentially duplicate retry.

## Unknown constraints

Available weekly time, hosting and model budget, preferred language, access to representative documents, and whether the main deliverable is a reusable library or a hosted application are not yet established.
