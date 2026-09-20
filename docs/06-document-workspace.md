# Document workspace and exhaustive review

Status: Core interaction implemented. The table distinguishes current runtime tools from planned workspace capabilities.

## Intended model

Agreed review behavior is recorded in [ADR 0002](decisions/0002-review-scope-coverage-and-audit.md): clear tasks proceed automatically; vague tasks receive a concrete scope clarification; general alignment review inventories both sides; inventories are built incrementally and audited by a separate role before comparison. [ADR 0007](decisions/0007-prompt-first-agent-workspace.md) records the implemented prompt-first interaction and durable activity stream.

An agent starts with a task and a compact inventory of uploaded documents. It discovers structure, searches, reads selected evidence, follows references, plans and revises its work, performs comparisons/calculations, and verifies the result. It can read a whole document when useful, without receiving every uploaded document in its initial context.

The environment should make PDFs, spreadsheets, and CSV files navigable in the way a repository is navigable through file listings, search, and range reads. Retrieval is one tool in this environment; it is not the complete agent workflow.

Parsing a source into an addressable representation and loading its contents into model context are different operations. We can process and index all pages while sending only selected content to the agent. Lazy processing is also possible, but the workspace must distinguish unprocessed content from processed content with no matches.

## Proposed navigation primitives

| Capability                    | Current status                                     | Purpose and behavior                                                                                              |
| ----------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Document discovery            | Implemented in task attachment and role resolution | Pin file IDs, formats, names, versions, and extraction status; filenames alone do not establish roles             |
| `inspect_document`            | Implemented                                        | Return source units, extraction warnings, and bounded structure; it does not prove semantic coverage              |
| `search`                      | Implemented lexical search                         | Return stable evidence IDs and bounded excerpts; a miss never establishes absence                                 |
| `read_unit` / `read_evidence` | Implemented                                        | Read a page or sheet-range unit and resolve exact evidence IDs with bounded/paginated output                      |
| `read_inventory`              | Implemented                                        | Traverse the independently built opposite-side checklist before any `not_found` result                            |
| Source viewer                 | Implemented UI capability                          | Open original PDF pages or stored sheet rows and highlight the resolved citation                                  |
| Reference resolver            | Planned                                            | Resolve cross-clause/appendix references as a distinct typed tool; current prompts preserve unresolved references |
| `calculate`                   | Implemented                                        | Compute with decimal, source-linked operands and record operation provenance                                      |

Search locates content; read retrieves its context. Reading page 5 does not require guessing a search term. Whole-document reads should succeed for suitable sizes; large reads should paginate or process sequentially rather than silently truncate or exceed the model budget.

MVP scope excludes OCR and scanned-document processing. Supported inputs are born-digital PDFs with usable embedded text, spreadsheets, and CSVs.

All tools enforce workspace permissions and preserve source/extraction versions. Tool results indicate whether they are embedded text, structured extraction, or derived summaries. Search of extracted text cannot establish coverage of unreadable images.

Spreadsheet navigation must retain sheet names, coordinates, headers, formulas versus cached values, and hidden/merged-cell metadata where supported. CSV navigation must expose dialect, columns, and row locations. These are format adapters behind a shared workspace, not an assumption that every source can safely become plain text.

## Two task modes

**Focused question:** discover and read enough evidence for the question, including relevant qualifications and references. Report the scope and limitations of the result.

**Exhaustive review:** first establish a complete inventory of review obligations in the designated scope. Then resolve each obligation through on-demand evidence gathering. Search alone cannot establish that the inventory is complete.

For exhaustive review, broad source inspection may be unavoidable. It can happen in bounded batches; exhaustive inspection does not require simultaneous full-document context. Cost and latency increase with the required coverage and must be measured.

## Worked example: final policy versus quotation

Task: check every in-scope claim provision, extension, and clause in a final policy against an uploaded quotation, which may be a PDF, spreadsheet, or CSV.

1. **Establish scope and roles.** Identify the intended final policy and quotation revisions, applicable schedules/endorsements, and what alignment means: coverage, limits, exclusions, deductible, dates, conditions, or other fields. Ambiguous revisions remain unresolved.
2. **Inspect the policy systematically.** Walk all pages/sections in bounded batches, including tables, footnotes, endorsements, and appendices. Record extraction gaps. Headings and keyword search assist navigation but cannot replace this pass.
3. **Build review obligations.** Each clause may create multiple atomic checks. Link each obligation to exact source regions and relevant definitions, conditions, exceptions, and references. Retain out-of-scope classifications with reasons for audit.
4. **Reconcile inventory coverage.** Every source unit in the policy's review scope must be accounted for by obligations, an explicit out-of-scope disposition, or an unresolved parsing/classification issue. Independently audit the inventory against the original sources; a model can miss or misclassify a clause.
5. **Find quotation evidence on demand.** Search for identifiers and equivalent terms; read relevant sections/cell ranges; expand to headers and surrounding conditions. Follow references, compare typed values, and calculate where required.
6. **Record each comparison.** Preserve policy evidence, quotation evidence, comparison dimensions, calculations, uncertainty, and a reasoned outcome. No match in one search is insufficient to declare a provision absent.
7. **Verify findings and completeness separately.** Re-resolve citations and check comparisons, then check the obligation ledger for pending work and extraction gaps. Distinguish a complete review containing mismatches from an incomplete review.
8. **Produce an inspectable report.** Show aligned items, differences, ambiguity, unresolved items, and coverage limitations. Every material conclusion links to both sides where available.

If the user also wants to ensure every promised quotation benefit appears in the final policy, create a second quotation-to-policy inventory. Policy-to-quotation review alone will not detect a quotation benefit entirely omitted from the policy.

For a general alignment review, bidirectional inventories are now the agreed default, subject to clarified scope. Present a unified checklist while preserving directional coverage and many-to-many source matches. The auditor inspects original sources with fresh context before receiving the main inventory, then identifies concrete gaps. Coverage audit and later finding verification are distinct stages, with bounded remediation and visible unresolved disagreements. See ADR 0002 for rationale and limits.

## Coverage ledger

Per [ADR 0003](decisions/0003-batched-clarifications.md), local blockers create persistent questions linked to affected obligations. Finish independent work before presenting the batch. Answers resume affected checks and trigger verification; broader changes invalidate all dependent results. A report with pending questions is explicitly incomplete.

Maintain two connected layers:

- **Source coverage:** which pages/blocks/tables were processed and inspected, extraction quality issues, and how each in-scope unit maps to obligations or a reasoned disposition.
- **Task coverage:** each atomic obligation, its evidence dependencies, work status, comparison outcome, and verification status.

Illustrative obligation:

```json
{
  "id": "obligation_017",
  "source_refs": ["policy:v1:extract1:p12:block4"],
  "check": "Compare extension deductible and its conditions",
  "work_status": "VERIFIED",
  "outcome": "DIFFERENT",
  "counterpart_refs": ["quotation:v2:extract1:sheetCoverage:D18:F18"],
  "dependencies": ["obligation_004"],
  "verification_record_id": "verification_029"
}
```

Work status (`PENDING`, `IN_PROGRESS`, `BLOCKED`, `REVIEWED`, `VERIFIED`) is separate from comparison outcome (`ALIGNED`, `DIFFERENT`, `NOT_FOUND_IN_REVIEWED_SCOPE`, `AMBIGUOUS`, `NOT_APPLICABLE`). Application code validates transitions; the agent proposes updates but cannot self-certify completion.

Report source-processing coverage, source-review coverage, obligation completion, and unresolved counts separately. A fully processed PDF is not a fully reviewed policy. A completed review can contain many differences. Percentages require an explicit denominator; checking 100% of an incomplete clause inventory is misleading.

## Completion rules and limits

Proposed mechanical gates for an exhaustive-completion label:

- All in-scope source units have recorded review dispositions, with no unresolved extraction gaps.
- All inventoried obligations have terminal reviewed outcomes and required verification records.
- Dependencies and missing references are resolved or explicitly reported as preventing completion.
- The report includes all material findings and outstanding limitations.

These gates detect recorded omissions; they do not prove a semantic inventory is perfect. Evaluate missed-clause rate and incorrect exclusions against independently annotated fixtures. Avoid promising zero omissions without evidence. Human overrides must be explicit and cannot silently convert uncertainty into alignment.

## Architecture implications

Add a document workspace/tool layer above the evidence store and a coverage manager alongside the workflow runtime. The agent controls navigation within allowed tools and budgets. The harness owns coverage state, verification requirements, and completion eligibility.

Persist a work queue, evidence references, dependencies, and verified findings outside the context window. On resume, load the current obligations and fetch supporting sources when needed. Summaries aid navigation; they never replace the underlying evidence.

## First experiments

- A clause uses wording absent from the task's search terms.
- An exception is on a distant page or in an endorsement.
- Unsupported image-only content must prevent an unqualified complete-review claim; OCR is not attempted.
- A compound clause contains three checks, only two of which align.
- The quotation contains a benefit absent from the policy; test directional versus bidirectional review.
- A tool response paginates; the agent must consume remaining scope or mark the review incomplete.
- A run resumes after compaction without dropping pending obligations.
- An inventory incorrectly excludes a clause; independent annotation must expose the omission.
