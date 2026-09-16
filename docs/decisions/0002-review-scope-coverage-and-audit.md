# 0002 — Scope clarification, bidirectional inventories, and independent audit

Status: Accepted direction from brainstorming, 2026-09-17. Detailed interfaces and implementation remain open.

## Context

The user wants an agent that navigates documents on demand, with exhaustive review where requested. A single whole-document prompt can omit obligations. A checklist derived only from a policy cannot detect quotation promises missing from that policy. Reviewing one's own inventory also risks reinforcing the original omissions.

## Decisions

### Clarify scope without unnecessary approval gates

For clear instructions, begin reading and reviewing without plan approval. For a vague request such as “check this policy against this quotation,” inspect the documents first and propose concrete comparison categories: coverage, limits, deductibles, exclusions, conditions, extensions, and relevant dates as applicable. Ask the user to clarify or confirm that scope before committing to the detailed review. This is task clarification, not permission for routine reads.

If later inspection discovers a material category outside the agreed scope, surface it rather than silently expanding or omitting it. Handling that interaction is still to be specified.

### Inventory both sides for a general alignment review

Build policy and quotation inventories independently against the agreed scope. Policy-to-quotation review detects additional or changed policy provisions; quotation-to-policy review detects promised benefits absent from the policy. A narrower explicit user request can restrict direction.

Present one unified review checklist. Preserve both source inventories and directional coverage internally. Matching may be one-to-many or many-to-many; do not equate one paragraph with one comparison. Shared matches should not produce duplicate user-facing findings.

A difference is a finding, not automatically an error or a breach. Describe the difference and applicable requirements separately.

### Build inventories incrementally

Inspect bounded pages/sections, extract atomic obligations, persist source-linked checklist items, and record continuations and unresolved references before advancing. Track coverage per page/source unit, but interpret clauses across page boundaries and with their definitions, exceptions, and endorsements.

Keep source-read status separate from source-accounted-for status. Every in-scope source unit needs obligations, a reasoned out-of-scope disposition, or an explicit unresolved issue. Persist inventories and pending work outside model context.

### Use a separate auditor role

Use one main agent role and one dedicated auditor role with fresh context. The auditor gets the agreed scope and original-document tools. Before seeing the main inventory, it makes its own bounded source inspection notes, then reconciles those notes against the inventory. Persist those notes as needed rather than requiring a whole-document context.

Audit findings must identify specific source locations and omissions, incomplete checks, or incorrect exclusions. The main agent resolves findings with evidence or records disagreement. Audit rounds must be bounded; unresolved disagreements eventually become user-visible review items rather than endless retries. Exact budgets remain open.

Separate roles reduce anchoring but do not eliminate correlated errors, especially when using the same model. Model selection remains undecided. This is a product architecture decision, not a requirement to use multiple development agents for every coding task.

### Separate coverage audit from finding verification

Coverage audit asks whether the agreed obligations were inventoried on both sides. Finding verification asks whether the comparisons are supported and correct. The auditor role can perform separate tasks for these stages; neither stage replaces deterministic citation, arithmetic, state, and completion checks.

## Proposed sequence

Agreed scope → incremental inventories on both sides → independent coverage audit → resolve gaps → match and compare → verify findings/calculations → report coverage, differences, and unresolved issues.

## Consequences and validation

Additional source inspection increases latency and cost. Benchmark missed-obligation rate, incorrect exclusions, false unmatched findings, audit corrections, and cost per review. Include clauses spanning pages, one-to-many matches, quotation benefits absent from the policy, and shared model mistakes. Mechanical coverage gates prove recorded work was accounted for; they cannot guarantee perfect semantic completeness.

## Still open

- Outcome taxonomy and what evidence is sufficient to label a provision absent.
- When ambiguity pauses one item versus the entire task.
- Audit retry/time/cost budgets and escalation behavior.
- Inventory and matching schemas, auditor tool permissions, and model choices.

Related: [workspace design](../06-document-workspace.md), [failure inventory](../05-correctness-failure-modes.md), and [evaluation plan](../04-evaluation.md).
