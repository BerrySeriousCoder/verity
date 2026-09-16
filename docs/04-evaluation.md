# Evaluation plan

Status: Draft — no experiments run and no performance claims established.

Scheduling update: evaluation infrastructure is post-MVP per ADR 0004. Engineering unit/integration checks are not deferred. Earlier outbound-action metrics are outside the review-only product; access control and review-state correctness remain relevant.

OCR and scanned-document understanding are outside MVP evaluation scope. Unsupported-content handling is a boundary check, not a requirement to interpret scans.

## Begin with inspectable cases

Proposed starting point: 20–30 deliberately varied cases, including correct reconciliation, wrong citation, arithmetic traps, version applicability, missing evidence, digital tables, conflicting sources, embedded malicious instructions, and retry/approval failures. Expand toward 500 only after annotation and scoring are credible.

Synthetic cases provide controlled errors but cannot establish real-world performance alone. Label synthetic versus real sources, document redistribution rights, and avoid implying that an insurance decision has expert validation without expert review.

Each case needs source documents, task, applicable policy, expected claims and allowed alternatives, evidence regions/cells, expected calculations, expected abstention/review behavior, and permitted actions. Missing evidence can make abstention the correct outcome.

## Primary measure

Grounded task success is the fraction of evaluated tasks meeting every applicable requirement: correct outcome, sufficient and correctly attributed evidence, no unsupported material claims, correct calculations, and no prohibited action or workflow violation.

Specify applicability and grading rules before running comparisons. Accept valid alternative trajectories rather than requiring one exact sequence of tool calls. Report components alongside the conjunction so one failure does not hide the others.

## Diagnostic measures

| Layer | Measures and caveats |
| --- | --- |
| Ingestion | Text error and table/cell extraction accuracy on annotated fixtures |
| Retrieval | Recall@k and precision@k against annotated evidence; incomplete annotations limit interpretation |
| Citations | Source/version/page correctness and region agreement; region overlap alone does not prove semantic support |
| Verification | False acceptance and false rejection, including confidently wrong semantic assessments |
| Output | Unsupported material claims and coverage of claims requiring evidence |
| Policy | Attempted versus executed unauthorized actions; stale-approval and bypass fixtures |
| Durability | Recovery after crash, preserved review waits, duplicate external-effect behavior |
| Operations | Cost, latency, tool calls, retries, abstention, and human interventions per task |

## Experiments

Following [ADR 0002](decisions/0002-review-scope-coverage-and-audit.md), compare inventory quality before and after the independent coverage audit. Measure missed obligations on each side, incorrect exclusions, one-to-many matching errors, duplicate findings, resolved versus unresolved audit issues, and extra cost/latency. Keep coverage audit metrics separate from semantic verification of final comparisons. Include cases where both roles make the same mistake; agent agreement is not ground truth.

The [document workspace design](06-document-workspace.md) adds policy-to-quotation fixtures. Measure clause-inventory recall, atomic-check coverage, incorrect out-of-scope classifications, and false claims of exhaustive completion, independently of citation correctness. Include distant exceptions, unreadable pages, paginated reads, and quotation benefits absent from the policy. Evaluate directional and bidirectional comparison separately.

Use the [failure inventory](05-correctness-failure-modes.md) as a fixture backlog. Evaluate correctness across document count, total pages/tokens, embedded-text extraction quality, supported digital tables, evidence dispersion, duplicate density, and required cross-document joins. Report per-slice results, including partial ingestion and incomplete runs; an overall average can hide failures on large inputs. Measure required-finding coverage separately from whether reported claims have valid citations. The scale points in the inventory are proposed experiments, not capacity claims.

Compare direct-document baseline, retrieval baseline, then evidence contracts, verifier, calculation tools, contradiction handling, and the full workflow. Cumulative additions show the build-up; removal experiments from the full system help isolate individual contributions.

Keep model configuration, corpus, and comparable budgets fixed. Report context truncation in the direct-document baseline. Split by document family/template to reduce leakage, separate tuning from held-out cases, repeat stochastic runs where practical, and publish sample counts and uncertainty.

Evaluation annotations must be independent of runtime verifier outputs. Agreement between an agent and its verifier is not ground truth. Record dataset, prompt, model, parser, policy, and code versions for each run.
