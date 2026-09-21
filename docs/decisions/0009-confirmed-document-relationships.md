# ADR 0009: Confirm document relationships before multi-document review

Status: accepted and implemented, 2026-09-21.

## Context

A single placement slip can produce several final policies. Several quotations can also contribute to a single policy. The previous singular policy role caused repeated clarification even after the user explicitly requested all policies. Merely replacing a scalar ID with an array would still let unrelated policy evidence satisfy a requirement.

## Decision

For prompt-first reviews, propose document roles and named relationship groups, ask the user to confirm or correct that mapping, and only then inventory and compare within those groups in both directions.

Each group identifies policy IDs, quotation IDs and a natural-language applicability boundary: coverage product, section, entity, location and period. Documents may participate in several groups. An independent group per policy is preferred; combined-policy groups can represent joint fulfillment. Every attached document must have exactly one document role and participate in at least one group.

Quotation checks receive explicit group assignments after inventory and canonicalization. Shared requirements expand into separate group-specific checks with their original observations intact. Unmatched or uncertain requirements remain visible and cannot become verified conclusions. Comparison search, explicit evidence resolution and opposite-side matching are restricted to the selected group's documents. Independent verification also checks applicability.

## Confirmation and persistence

Migration 0006 adds policy ID arrays and a persisted relationship proposal without rewriting historical checkpoints. The singular policy field remains for legacy reviews. A new proposal always pauses in `needs_context`; only a later affirmative user message confirms it. Corrections produce a fresh proposal and require another confirmation. Confirmation is interpreted by a structured model call, so intent interpretation remains a model-quality dependency.

The existing paused multi-policy conversation can continue through the new mapping flow. Already-resolved older reviews retain their original scope; create a new review to change document relationships.

## Limits and evidence

Inspection samples the first 12 blocks of each extracted unit, capped at 800 characters per preview block. It can identify headings beyond the first page/sheet, but is not exhaustive semantic relationship discovery. Applicability and cross-document precedence remain semantic judgments; user confirmation and independent verification reduce risk but do not prove all matching correct. No evidence is synthesized from user approval.

Tests cover three policies to one quotation, two quotations to one policy, correction/confirmation boundaries, per-group evidence isolation and preservation of uncertain requirements. Browser tests exercise proposal confirmation before questionnaire generation. A synthetic live Gemini test mapped three site policies to one quotation and produced verified results. This does not establish accuracy on arbitrary insurance documents.
