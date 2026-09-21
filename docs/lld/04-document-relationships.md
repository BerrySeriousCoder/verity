# Confirmed document relationships

Status: implemented, 2026-09-21. See [ADR 0009](../decisions/0009-confirmed-document-relationships.md).

## Data and compatibility

`ReviewRun.policyIds` lists all final policies. `quotationIds` lists all quotations. `documentRelationships` stores `{confirmed, proposedRevision, groups}`. Groups contain stable IDs, titles, policy/quotation ID arrays and applicability descriptions. `policyId` remains the first policy for legacy API/checkpoint compatibility; the prompt-first runtime, panel attachments and report citation resolution use the arrays.

The conversation API initially assigns a storage placeholder role to each attachment. `establishRelationships` replaces it only with a validated proposal accounting for every document exactly once. Group references must belong to the declared roles, and every document must participate in at least one group. Database assignment is fenced by run lease and revision.

## State transitions

`queued → running → needs_context (proposal)` occurs before questionnaire creation. A later context reply is classified as acceptance, correction or unclear. Acceptance confirms exactly the persisted proposal. Correction produces a new unconfirmed proposal; unclear replies keep the review paused. Source content cannot supply approval. Once confirmed, normal scope clarification runs if needed.

Role proposals survey every extracted unit using bounded previews and expose those reads as tool events. The preview is sufficient to propose, not guarantee, applicability; uncertainty must be disclosed to the user. Existing unresolved engine-2 tasks enter this new flow; legacy resolved runs do not have their roles reinterpreted.

## Check routing

Inventories classify document direction using the full policy ID set. Canonical raw-member coverage still runs before relationship expansion. Policy-origin checks inherit groups containing that policy. Quotation-origin checks are routed in packets of 16 using their original evidence, source provenance and confirmed group descriptions. Every requested check ID must occur exactly once in the routing output; invented groups and cross-document assignments are rejected.

A quotation requirement can apply to multiple groups. Each resulting check has an input-derived ID and relationship ID; all retain the original raw members. After expansion, set coverage verifies that no raw observation disappeared. Therefore raw member IDs may intentionally appear in more than one relationship check. Unknown applicability retains an unverified candidate instead of disappearing from the questionnaire.

Candidates, lexical search and follow-up evidence reads use only documents allowed by the check's group. The comparison receives its relationship, and deterministic citation gates reject out-of-group evidence. Applicability uncertainty prevents acceptance even if a semantic verifier returns support. The verifier receives original cited evidence plus the relationship and checks product/entity/location applicability independently. Relationship descriptions and user confirmation are context, not documentary proof.

## User experience and exports

The conversation lists the proposed groups using filenames and scopes and asks for confirmation. Group titles prefix checklist titles; details display applicability rationale and uncertainty. All policy documents are visible in attachments and grouped as policy evidence. JSON reports include all policy IDs, confirmed relationships, per-finding relationship IDs and resolved citations across the full attachment set.

The old explicit single-policy review endpoint remains compatible. Multi-policy entry is through the prompt-first conversation interface. Changes to a confirmed relationship after review begins require a new task rather than silently invalidating existing findings.

## Validation

Database tests cover three-to-one and one-to-many relationships, mandatory confirmation, corrections, document isolation, and uncertain applicability. Browser tests verify the pause/confirm/start sequence. `LIVE_MULTI_POLICY=1 pnpm test:live` creates three synthetic PDF policies plus one CSV quotation, confirms the proposed mapping within the isolated test, and requires a complete report with a verified discrepancy.

Remaining work includes exhaustive section-level applicability proofs, automatic precedence resolution among competing quotation versions, independent auditing of excluded relationship candidates, and adaptive splitting of malformed applicability-routing packets. Current routing failures preserve checkpoints and stop visibly; no invalid routing output is silently accepted.
