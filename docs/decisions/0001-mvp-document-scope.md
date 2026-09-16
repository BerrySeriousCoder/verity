# 0001 — Exclude OCR and scanned documents from the MVP

Status: Accepted by explicit user instruction, 2026-09-17.

## Decision

The MVP processes born-digital PDFs with usable embedded text, spreadsheets, and CSVs. OCR and scanned-document understanding are out of scope.

## Context and consequences

Focus implementation on on-demand navigation, source-linked comparisons, citation inspection, and review completeness. Ingestion still needs explicit unsupported/partial-content states so unprocessed image-only material cannot silently count as reviewed. This does not require implementing OCR or perfect scan classification.

The alternative of building an OCR pipeline immediately is deferred. Revisit only if a later product requirement includes scans. Related entries in the failure inventory remain future-scope considerations.
