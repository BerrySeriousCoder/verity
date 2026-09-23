# 0011 — Evidence context and honest result states

Status: implemented for new reviews (batching version 4), September 23, 2026.

## Problem observed

The fictional policy/placement-slip run processed 33 directional checks. Its report contained 18 `different`, 12 `aligned`, and 3 `unverified` findings, but all 33 carried `verified: true`. The summary incorrectly said zero remained unverified. Two unresolved scope questions concerned text already available in the supplied documents. Some coverage clauses used matching “total sum insured” wording while referring to unequal amounts. Reciprocal checks repeated findings, and exclusions such as premium arithmetic were not visible to the user.

## Decision

Separate a resolved comparison from a verifier accepting uncertainty. Retrieve enough original context to resolve referenced values, preserve directional obligations when sharing work, and expose excluded passages without broadening the agreed scope.

- Resolved means `verified` and status `aligned` or `different`. Summaries count unresolved statuses even in historical reports whose boolean was wrong. The UI renders corrected summary text without rewriting saved events. A paused run says “Waiting for your input,” independently of its streaming connection.
- New reviews load each small document once per execution: at most 200 blocks and 16,000 extracted characters. Complete small-document context is included only when the aggregate is at most 24,000 characters. Larger relationships use targeted search and neighboring blocks; no truncated document is described as complete. These are retrieval-context thresholds, not execution or model-output budgets.
- Coverage references to total sum insured trigger schedule retrieval. Comparison and independent verification must distinguish wording/peril inclusion from effective monetary limits and cite dependencies. A deterministic guard rejects aligned conclusions with missing, ambiguous, unequal, or uncited explicit monetary totals. It handles explicit INR/USD/EUR/GBP decimal amounts; scaled or more complex schedules remain unresolved rather than being guessed. This guard only rejects alignment; it never invents a discrepancy verdict.
- Follow-up queries use lexical alternatives instead of requiring every word of a natural-language phrase. Original source text and anchors remain immutable. Verifiers receive additional context so an incomplete citation selection cannot conceal contradictions.
- Exact-title checks within a relationship can share comparison work despite different source references or categories. Ambiguous same-direction source sets, answered checks, and uncertain applicability remain separate. Every original obligation goes to the reviewer and verifier. Different source values are the subject of comparison, not a reason to avoid shared work.
- Shared results carry a comparison identifier. The questionnaire groups them by default and provides links to each original directional check; users can disable grouping. Counts describe directional checks, not unique discrepancies. Different means a supported disagreement between documents, not a ruling about which document is correct.
- Both inventory passes retain exclusions. A passage included by either pass is not listed as excluded. Reports expose excluded passages with reasons and source links; premiums do not silently become in scope for a coverage-only request.

## Persistence and compatibility

Migration 0009 changes only the default batching version for new runs. Existing runs retain their saved work and execution layout. No previously accepted findings are silently regraded or replaced. A fresh review is required to exercise new retrieval and grouping behavior. Exclusions are saved alongside source-pack checkpoints and retained on resume.

## Validation and limits

Regression tests cover uncertainty counts, differing referenced totals despite approving model judges, missing dependency citations, ambiguous/scaled values, lexical misses recovered by full small-document context, workspace/document isolation, bounded retrieval, and reciprocal-work preservation. Integration tests use isolated PostgreSQL schemas and scripted models; they do not measure Gemini accuracy or costs. Browser tests cover grouped directional checks, source navigation, and the waiting state.

This is not a guarantee of exhaustive semantic correctness. Arbitrary cross-references, large multi-location schedules, and differently named duplicate concepts still need further evaluation. Conservative abstention is preferable to unsupported alignment. The next real fixture run should measure discrepancy recall, false alignments, unresolved reasons, model calls, tokens, and elapsed time before claiming an accuracy or cost improvement.
