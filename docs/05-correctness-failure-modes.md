# Correctness and failure-mode inventory

Status: Draft. This is a threat model and test backlog, not a claim of exhaustive coverage or implemented defenses.

## Central requirement

Produce correct, sufficiently complete, evidence-grounded decisions across large documents, mixed document structures, and multiple related documents. When the available sources or processing quality cannot support a decision, expose that limitation and abstain or request review.

One demonstration workflow can exercise this general requirement. A narrow domain does not justify testing only short, clean, single-document inputs.

Correctness has separate dimensions: faithful extraction, relevant and sufficient retrieval, correct interpretation, applicable evidence, correct synthesis and calculations, faithful final output, and valid workflow state. A citation can accurately quote a source whose contents are false; grounding does not establish external truth.

## MVP scope decision

OCR and scanned-document processing are excluded by user decision. Related failures below remain future-scope notes, not MVP implementation requirements. Image-only content must be identified as unsupported or unresolved rather than silently included in a complete-review claim.

## Failure inventory

Each row gives a candidate defense and an experiment. Defenses must be validated before they become guarantees. IDs can be referenced from LLDs and fixtures.

| ID  | Failure and example                                                                     | Proposed defense / responsible component                                                  | Test                                                         |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| F01 | Missing input: an attachment or referenced appendix was never supplied                  | Ingestion manifest and explicit missing-source state                                      | Remove a required attachment                                 |
| F02 | Silent partial processing: a large PDF parses only its first pages                      | Per-page processing status and completeness checks in ingestion                           | Fail extraction midway through a file                        |
| F03 | OCR changes meaning: `1,000` becomes `7,000`, or `not` disappears                       | Preserve page images; flag ambiguous critical fields; targeted visual review              | Scanned digits and negation with annotated truth             |
| F04 | Reading order merges columns, headers, or footers                                       | Layout-aware blocks and source inspection                                                 | Two-column text with repeated headers                        |
| F05 | Table structure loses a header, unit, merged cell, or continuation row                  | Cell/header relationships and page-spanning table handling                                | Table continued onto another page                            |
| F06 | Evidence appears only in a diagram, stamp, checkbox, handwriting, or image              | Detect unsupported content; visual extraction adapter or explicit review                  | Answer exists only in a figure or checkbox                   |
| F07 | Format semantics are lost: spreadsheet formulas, hidden sheets, or email quoted history | Format-specific adapters with declared capabilities                                       | Formula versus cached value; quoted obsolete instruction     |
| F08 | Text normalization corrupts identifiers, decimal separators, dates, or units            | Preserve raw and normalized representations; typed field validation                       | Similar part IDs, ambiguous dates, mixed locales             |
| F09 | A citation shifts after reparsing or cites printed page 12 instead of physical page 12  | Immutable extraction IDs and explicit page-coordinate conventions                         | Reparse source and resolve old citation                      |
| F10 | Relevant evidence falls outside the model context window                                | External evidence store and bounded retrieval; record truncation                          | Move evidence beyond direct-context capacity                 |
| F11 | Relevant evidence is present but buried among distractors                               | Context selection with measured relevance and token budgets                               | Move evidence between beginning, middle, and end             |
| F12 | Chunk boundaries split a condition from its exception                                   | Structural retrieval with parent/neighbor expansion                                       | Rule and exception in adjacent chunks/pages                  |
| F13 | Search misses exact identifiers or paraphrased concepts                                 | Exact filters plus lexical/semantic retrieval experiments                                 | Near-identical IDs and unfamiliar wording                    |
| F14 | Top-k finds one useful passage but omits another required source                        | Decompose evidence obligations and track unresolved obligations                           | Answer requires three independently located facts            |
| F15 | Search returns the wrong case, entity, or document family                               | Enforce access/case filters before retrieval; explicit entity matching                    | Distractor case with nearly identical names                  |
| F16 | No search match is interpreted as proof that something does not exist                   | Distinguish absence in inspected scope from global absence                                | Relevant evidence outside initially searched sections        |
| F17 | Duplicate documents crowd out results or masquerade as independent corroboration        | Source lineage and duplicate-aware ranking/counting                                       | Twenty copies of one source plus one opposing source         |
| F18 | Summary drops a qualifier or becomes unsupported evidence                               | Source-linked summaries; re-resolve original evidence for decisions                       | Compact away an exception and verify recovery                |
| F19 | Multi-step search follows the wrong reference or stops too early                        | Track reference dependencies and missing evidence; bound exploration                      | Procedure points to an appendix and another document         |
| F20 | Facts from different people, parts, cases, or dates are joined                          | Typed entity keys and scope-aware joins                                                   | Same label refers to two different components                |
| F21 | Newest source is selected even though an older version applies                          | Explicit effective-date and applicability rules                                           | Historical case governed by earlier revision                 |
| F22 | Source authority is assumed from appearance or wording                                  | Workflow-owned authority metadata and explicit unknown authority                          | Unverified memo formatted like an official procedure         |
| F23 | A real conflict is ignored, or different contexts are falsely called conflicting        | Compare entity, attribute, unit, time, and role before conflict handling                  | Quoted, approved, and paid amounts differ legitimately       |
| F24 | Negation, conditional language, exceptions, or uncertainty are flattened                | Atomic qualified claims and targeted semantic verification                                | `May replace if damaged` becomes `must replace`              |
| F25 | Citation is valid but does not entail the claim                                         | Separate structural validation from semantic support assessment                           | Correct document and page, wrong supporting paragraph        |
| F26 | Individually supported premises yield an invalid inference                              | Represent derivations and validate allowed inference steps                                | Two true facts joined by an unsupported assumption           |
| F27 | Arithmetic is right but operands, currency, scope, or rounding are wrong                | Typed source-linked operands and explicit calculation rules                               | Subtotal double-counted; dollars mixed with cents            |
| F28 | All reported claims are supported but required findings are omitted                     | Task-level obligation coverage, distinct from citation precision                          | Agent reports one of five material discrepancies             |
| F29 | Agent writes supported structured claims, then embellishes the final draft              | Verify final material claims or constrain rendering                                       | Draft adds an unsupported causal explanation                 |
| F30 | Verifier repeats the generator's error or accepts its rationale uncritically            | Independently resolve source evidence; deterministic checks; held-out verifier evaluation | Plausible but misleading generator justification             |
| F31 | Arbitrary confidence scores or thresholds hide uncertainty                              | Defined component signals, calibration where possible, explicit unknowns                  | Evaluate false acceptance across threshold choices           |
| F32 | Endless retrieval, excessive spend, or premature completion                             | Explicit time/cost/retry limits and incomplete outcomes                                   | Repeated empty searches and dependency timeouts              |
| F33 | Resume uses stale summaries or forgets unresolved obligations                           | Persist structured state, evidence references, and outstanding issues                     | Restart during conflict resolution                           |
| F34 | A newly uploaded source version is mistaken for the version previously verified         | Pin immutable source/extraction IDs on every run and finding                              | Upload a replacement and resolve the old citation            |
| F35 | Document instructions manipulate agent tools or reveal other cases                      | Treat source content as data; enforce tool capabilities and scoped access                 | PDF requests a tool call or cross-case lookup                |
| F36 | Activity UI implies unsupported conclusions or exposes private/internal output          | Separate public progress, actual tools, verified findings, and unresolved status          | Stream partial structured output or an unverified conclusion |
| F37 | Retry repeats expensive calls or competing workers commit conflicting state             | Durable step keys, leases, stale-writer rejection, and bounded retries                    | Crash after a model response but before checkpoint commit    |
| F38 | Evaluation rewards the same errors as the system or hides difficult cases               | Independent annotations, held-out families, per-slice reporting, adjudication             | Include ambiguous cases and alternative valid citations      |

## Long-document design questions

Do not equate page count with difficulty. Measure document count, total extracted tokens, layout complexity, evidence dispersion, number of required joins, distractor density, and extraction quality.

For a provisional scale sweep, compare 10, 50, 200, and 500 total pages across one document and many documents. These are experiment sizes, not supported limits. Repeat tasks while varying one dimension, then test combinations such as a long digital appendix with a version conflict.

Separate four bottlenecks:

1. **Extraction coverage:** did we process every relevant page and modality?
2. **Retrieval coverage:** did we discover every necessary fact and exception?
3. **Context preservation:** did selected context and summaries retain those facts accurately?
4. **Reasoning coverage:** did the final decision account for all required facts and unresolved issues?

A larger context window addresses only part of this chain. Retrieval can reduce context size while still missing decisive evidence. A verifier checking only the citations provided by the agent cannot discover every omitted exception; the verification design needs targeted additional retrieval and must report its search scope.

## Prioritization and next design step

Before selecting parsers, models, or databases, agree on the supported document envelope: formats, languages, page/token range, number of files, digital-table requirements, and which outcomes need human review. Unsupported or incomplete processing must be visible.

Then map each first-release requirement to failure IDs, an owning component, and an acceptance fixture. Start with a few examples per high-risk family rather than claiming every listed problem is solved. Update this inventory whenever a new failure appears.
