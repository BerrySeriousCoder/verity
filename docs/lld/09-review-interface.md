# Review interface: citation resolution and source highlighting

Status: Prompt-first review interface and citation navigation implemented. Advanced viewer cases listed below remain planned validation.

## Implemented task interaction

The primary screen follows [ADR 0007](../decisions/0007-prompt-first-agent-workspace.md): attach two or more documents, describe their roles and the check in one prompt, and submit. The main timeline then renders durable user messages, short streamed progress summaries, expandable model steps, actual tool calls/results, findings, batched questions, and terminal status. Recent tasks and workspace files remain available in the navigation sidebar.

The browser subscribes to `GET /api/workspaces/:workspaceId/reviews/:runId/events`. PostgreSQL event IDs provide ordering and reconnect cursors; periodic snapshots update the run/report. Events are capped when persisted. The active run ID is stored locally only as a navigation convenience; the database owns the conversation itself. Stop cancels queued/running work, and a refresh replays stored activity.

Model-private reasoning is not a UI artifact. Each structured Gemini response starts with a bounded `publicSummary` intended for the operator. Verity streams that field and exposes real harness operations separately, avoiding a misleading imitation of hidden reasoning.

## Principle

A citation is a stored reference to immutable evidence, not a filename plus text to search for at click time. The agent cites evidence IDs returned by tools. The server resolves those IDs to validated source anchors; the agent does not invent pixel coordinates.

## Source anchors

Every anchor includes workspace, document-version, and extraction-version identity. A citation can contain multiple anchors, including multiple pages or documents.

PDF anchors contain a zero-based physical page index and one or more rectangles in canonical PDF user space, plus the page's view box, intrinsic rotation, and extraction provenance. Printed page labels are display metadata. Rectangles use explicit `[xMin, yMin, xMax, yMax]` coordinates, not an ambiguous mix of width/height and endpoints. Precision is recorded as word, line, block, or page; do not promise sentence precision from block-only extraction.

Parser adapters convert their native coordinates into this canonical space. OCR and scanned documents are outside MVP scope. If reliable coordinates are unavailable for embedded text, expose a page-only anchor and the limitation rather than fabricate a highlight.

Spreadsheet anchors contain a stable sheet ID within the immutable extraction and one or more zero-based inclusive row/column ranges. Preserve the sheet's original name, merged ranges, and formula/cached/display values where available. CSV anchors use original record and column indices, not physical text-line numbers: quoted fields may contain newlines. Header interpretation and dialect belong to the extraction version.

## Click lifecycle

1. Result UI emits a citation ID, also usable in a workspace deep link.
2. An authenticated resolver verifies workspace access and returns source anchors, display labels, quoted text, precision, and file/render metadata.
3. Frontend selects the PDF or grid adapter. Original files are served through an authorized endpoint or short-lived URL; stored citations never depend on an expiring URL.
4. PDF adapter loads the pinned source, renders the target page, scrolls to the region, and paints highlights. Grid adapter opens the pinned sheet snapshot, loads the relevant row/column window, scrolls, and selects the original range.
5. Neighboring content remains accessible. Multi-anchor citations offer explicit navigation among locations; comparing policy and quotation can use two panels.

Illustrative resolver path: `GET /workspaces/:workspaceId/citations/:citationId`. Distinguish inaccessible/missing citations, unavailable retained source versions, and sources still processing. Do not silently fall back to the latest file version. Do not reveal another workspace's document metadata through error responses.

## PDF renderer

Proposed renderer: PDF.js. Its documented API supports document loading, page access, and viewport-based rendering; use the [official examples](https://mozilla.github.io/pdf.js/examples/) and [API documentation](https://mozilla.github.io/pdf.js/api/draft/api.js.html) when implementing. Pin a tested package version during setup.

Render the original PDF page to a canvas with a positioned SVG/HTML highlight layer sharing its CSS viewport. Convert canonical rectangles with the same PDF.js viewport transform used for the page, including intrinsic/user rotation, crop origin, and zoom. Normalize transformed rectangle corners before drawing. Device-pixel ratio scales the canvas backing store; highlight coordinates remain CSS pixels.

Preserve several line rectangles when available rather than drawing one large rectangle across unrelated text. Recompute overlays when zoom/rotation changes. Optional text selection is a separate layer. The MVP highlights evidence extracted from born-digital PDFs.

Virtualize page rendering and cache a bounded number of nearby pages. PDF.js supports range loading when the server supports partial content, but navigating to one page does not guarantee that only that page's bytes are fetched. Validate range responses and loading behavior with representative files.

## Spreadsheet and CSV renderer

Start with a read-only, virtualized grid over the stored extraction snapshot. Fetch bounded cell windows with headers, original coordinates, and relevant merge metadata. Highlight by original coordinates, not a DOM row number. Filters or sorting must not redirect a citation to a different source row; citation inspection should reveal the original source location.

Display formula text separately from cached results, and label missing/stale/unsupported values. Do not execute workbook macros or silently recalculate formulas in the browser. This initial viewer preserves inspectable data locations but does not promise full Excel layout fidelity, chart rendering, or calculation compatibility. Unsupported evidence must be explicit, with original download available under access control.

## Recovery and interaction details

- Rapid successive clicks must cancel or disregard stale requests so an earlier page cannot replace the current citation.
- Missing coordinates open the correct page with a visible page-only label.
- Rendering failure produces a retryable error and authorized original-file access, not an invented preview.
- Citation navigation supports keyboard focus and a textual source label; color is not the sole indicator.
- Reprocessing creates new anchors without altering old findings. Source retention and deletion policy must define when old citations become unavailable.

## First validation slice

Before building the agent, prove that a stored evidence ID opens and highlights the correct source:

1. Digital PDF with repeated text: exact occurrence is selected without text search.
2. Rotated/cropped PDF at multiple zoom levels and device-pixel ratios.
3. Unsupported image-only content is visibly excluded from completed-review coverage; no OCR processing is attempted.
4. Multi-line and multi-page citation, with page-only fallback when appropriate.
5. Sheet range with merged cells, another sheet with the same values, and a large row index.
6. CSV with quoted newlines and duplicate column labels.
7. Old file version after replacement, unauthorized workspace access, expired file URL, and rapid navigation clicks.

Assert resolver identity and coordinate transformations mechanically; inspect screenshots against known annotated fixtures for actual visual alignment. This validates provenance and navigation, not semantic support of the claim.

## September 23, 2026 — Comparison-first finding detail

Selecting a questionnaire result opens a full-width evidence comparison. The finding title appears once without the repeated relationship prefix, followed by its status and explanation. Quotation (offered) and policy (issued) are rendered side by side on desktop and stacked on mobile. Each side has its own citation selector, original document viewer, and exact source excerpt. Selecting another citation can change the document or page independently; missing evidence is explicitly shown rather than inferred from the opposite role.

PDF pages fit the available pane width and scroll to the cited region. Spreadsheet citations select and scroll to the cited row, including when that row falls outside the first loaded block page. Source browsing/search is collapsed by default in comparison mode. Verification, applicability, reciprocal checks, and raw observations remain available under a separate disclosure. Mismatches use amber; aligned results use green. Back to results preserves the list filters; Escape leaves finding detail.

This is a presentation change over saved evidence. It performs no model calls and does not change findings or verification. Original file access from the chat remains available separately. Browser regression checks cover simultaneous PDF/sheet highlighting, desktop side-by-side placement, and mobile overflow.

Finding navigation and panel resizing use a short fade-and-slide transition: 120 ms out, then 200 ms in. Closing waits for the exit animation before removing the panel. Repeated navigation clicks during an exit are ignored; unmount cancels pending navigation. Reduced-motion preferences bypass the animation.

Back to results stays in the non-scrolling header. Closing the questionnaire clears the selected-check URL fragment so reopening starts at the results list; refreshing an open comparison still restores its deep link.
