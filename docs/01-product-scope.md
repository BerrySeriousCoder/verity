# Product scope

Status: Agreed MVP scope and implemented product boundary.

[ADR 0004](decisions/0004-product-boundary-and-foundation.md) establishes a review-only product. The product produces findings/reports and resolves clarifications; it never corrects source documents or performs outbound actions. Policy-versus-quotation is the current example workflow. Evaluation infrastructure follows the MVP; engineering testing accompanies implementation.

## Problem

Document agents can produce a plausible result while citing the wrong page, using an obsolete source, making an arithmetic error, or silently omitting required checks. Verity should make these failures visible and enforce explicit rules between proposed claims and review completion.

The central requirement is correctness across large documents, heterogeneous document structures, and multiple related documents. The first workflow is a demonstration of this requirement, not a reason to restrict evaluation to small, clean files. See the [failure inventory](05-correctness-failure-modes.md) before choosing implementation components. Exact supported formats and scale remain to be agreed.

## First workflow

The core product is an agent that navigates uploaded PDFs, sheets, and CSVs on demand. The motivating workflow is checking every relevant clause/extension in a final policy against a quotation. See the [document workspace design](06-document-workspace.md) for this walkthrough and its completeness requirements.

An operator attaches a final policy, a quotation, and optional supporting documents, then describes their roles and requested check in one prompt. Verity inventories both sides within the agreed scope, checks corresponding clauses/amounts/conditions, attaches inspectable evidence, verifies findings independently, and produces a review report. The operator sees unresolved issues and can answer batched questions in the same conversation.

## Initial boundaries

First release:

- One workflow and one operator-facing review screen.
- Born-digital PDFs with usable embedded text, spreadsheets, and CSVs. OCR and scanned-document processing are explicitly out of scope for the MVP (user decision). Unsupported image-only content must not silently count as reviewed.
- Immutable document versions, page/block citations, exact decimal calculations, verification results, and recorded workflow transitions.
- Pause/resume for review, with restart recovery demonstrated.
- Preserve the traces and provenance needed for a post-MVP benchmark; build the evaluation runner after the review flow is complete.

Later candidates: broad file-format support, multi-domain policy packs, complex multi-user roles, and extensive source connectors. Document editing and external actions are outside the product boundary.

## Acceptance scenarios

1. A correct reconciliation includes clickable evidence for every material factual claim.
2. A nonexistent citation or incorrect total fails verification.
3. Missing or conflicting evidence produces an explicit unresolved result.
4. Restarting a worker preserves committed progress and pending review.
5. A vague prompt pauses with a concrete scope or role question; a clear prompt proceeds.
6. Reloading the browser restores the durable conversation, tool activity, findings, and pending questions.
7. The application never edits an uploaded source or performs an external action.

## Unknown constraints

Representative document access, hosting/model budgets, target document sizes, and deployment/authentication requirements remain to be established before shared production use.
