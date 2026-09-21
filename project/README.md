# Development workspace

This pnpm workspace contains the modular monolith. Git lives one directory above so code and architecture decisions share history.

## Run locally

Use Node 22.20.x (or a later Node 22 release), pnpm 10.8.0, and Docker.

```sh
cd project
pnpm install --frozen-lockfile
cp -n .env.example .env
# Set GEMINI_API_KEY in .env before starting model-backed reviews.
pnpm dev
```

`pnpm dev` starts PostgreSQL through Docker Compose, waits for its health check, applies pending migrations, and then starts the API, worker, and Next.js app. Open **http://127.0.0.1:3000**. Next.js serves the workspace and forwards `/api` to the local Fastify API on port 3001. The API and frontend bind to localhost; a background worker handles extraction and reviews. Upload digital PDFs, UTF-8 comma-separated CSVs, or XLSX files up to 20 MiB, attach at least two files, and explain the task and document roles in the prompt. Verity resolves the roles, shows durable model/tool activity while it works, and asks in the same conversation when roles, scope, or evidence need clarification. Findings link to PDF regions or spreadsheet rows. Original files are never edited.

The API seeds one local workspace after explicit migrations. Identical bytes reuse a document record within that workspace; different bytes with the same filename get a new identity. Document metadata lives in PostgreSQL; original bytes live in ignored `project/.data/blobs/`.

Docker Compose uses `postgres:16-alpine`, a named volume, and `127.0.0.1:55432`. Database/user: `verity`; local password: `verity_local_only`. Copy `.env.example` to `.env` for overrides; the API, worker, and migration commands load that file. Restart the app after changing environment settings. Keep `DATABASE_URL` consistent with any changed Compose settings. These credentials are local defaults, not production secrets.

`pnpm db:down` stops PostgreSQL without deleting its volume. Stop `pnpm dev` with Ctrl+C; PostgreSQL remains available for the next run. `pnpm dev:apps` starts only the application processes when the database is already managed separately. Preserve both the database and blob directory to retain uploads. No garbage collection or destructive reset command is provided.

## Boundaries

| Location             | Responsibility                                                                   |
| -------------------- | -------------------------------------------------------------------------------- |
| `apps/web`           | Next.js/Tailwind agent workspace, SSE timeline, source viewers                   |
| `apps/api`           | Fastify HTTP validation, uploads, evidence, conversation/SSE and review routes   |
| `apps/worker`        | Leased extraction and review jobs with checkpoint recovery                       |
| `packages/core`      | Document use case, errors, types, and persistence interfaces                     |
| `packages/database`  | PostgreSQL repositories and transactional, checksummed migrations                |
| `packages/ingestion` | PDF.js text/regions, CSV records, ExcelJS workbook values                        |
| `packages/agent`     | Gemini SDK, coverage inventories, independent verification and calculation tools |
| `packages/storage`   | Immutable local original-file storage                                            |
| `evals`              | Post-MVP evaluation planning, no runner yet                                      |

Applications consume packages; packages never import applications. Browser code imports domain types only, not server implementations. API and worker entry points share the modular backend. Add domain modules alongside real features, not speculative abstractions.

The frontend uses Tailwind utilities and reusable components. `globals.css` contains only the Tailwind import. No Vite, CSS modules, or handwritten component stylesheets are used.

## Checks

```sh
pnpm check                 # formatting, strict types, unit tests, Next.js build
pnpm test:integration      # actual PostgreSQL; creates/removes a random test schema
pnpm exec playwright install chromium
pnpm test:e2e              # isolated database schema + blob directory; real browser
pnpm test:live             # real Gemini calls on generated sources; requires key, incurs cost
```

Integration/browser tests use `TEST_DATABASE_URL` when provided, otherwise the default local database. Test credentials need schema creation privileges. Tests remove only their generated schemas and temporary blob directories. Browser tests need ports 3100 and 3101 free, start their own servers, and do not reuse a running application. Screenshots/traces are ignored under `test-results/`. CI runs these checks against PostgreSQL.

The later agent evaluation benchmark is separate from engineering tests. Use reviewed forward migrations for schema changes; never edit applied SQL files. Do not commit credentials, uploaded originals, generated browser output, or private fixtures.

## Current limits

This is a single-user development application without authentication. The API refuses production mode and binds only to localhost; workspace filtering does not replace authorization. Shared deployment requires authentication, membership enforcement, operational resource limits, backups, and recovery work.

Engineering tests use a deterministic model double; they test orchestration and do not establish Gemini accuracy. The generated-source live smoke test has completed successfully with Gemini, establishing SDK/schema/runtime compatibility rather than domain accuracy. Model choice is configurable through `GEMINI_MODEL` and `GEMINI_AUDITOR_MODEL`; defaults follow Google's current documented example. External model calls incur provider charges and send selected source excerpts to Gemini.

The activity timeline shows bounded user-facing progress summaries and actual application tool inputs/results. It does not expose private model chain-of-thought. Activity is persisted locally in PostgreSQL and may contain document excerpts returned by tools.

No OCR, scanned-image interpretation, corrected-document generation, external actions, formula execution, or post-MVP benchmark platform. Empty text pages and missing spreadsheet formula caches remain explicit source limitations. PDF text reading order and table relationships can still need manual inspection. XLSX archives are checked against 32 MiB per-entry / 100 MiB total actual expansion limits before parsing. Parsing is still in-process and not yet suitable for hostile public uploads. The workbook parser's UUID dependency is pinned to a patched compatible release through a scoped pnpm override.

Gemini owns its native context and response-token limits; Verity records model calls and provider-reported usage without imposing a smaller call or token ceiling. New reviews compare packets of eight checks with at most one focused evidence follow-up; unresolved items remain unverified. Legacy reviews retain their 16-step investigation loop. Each worker run attempt remains bounded to two hours. Hitting an execution bound yields an incomplete review, never an alignment result. Calls interrupted before checkpoint commit can repeat on recovery. Independent model contexts reduce shared context bias but do not guarantee independent errors or complete semantic coverage.

A source block must appear in an obligation or a reasoned exclusion in both independent inventory passes. Their raw observation union is preserved. New reviews consolidate equivalent observations within document/category partitions, with exact membership checks that reject omissions and duplicates. Reading all blocks is measurable; correctly identifying every clause is still a model-quality question. Clarification responses currently trigger conservative re-verification of all findings because semantic dependencies are not yet modeled explicitly. Inputs and model names are pinned for a run; changed documents or a changed agreed scope require a new review.

## Parallel reviews and the live questionnaire

New tasks use engine version 2. Existing tasks retain their original engine and checkpoints; start a new task with the same files to use batching.

The harness shares six simultaneous Gemini request slots across inventory, independent audit, grouping, comparison, and verification. Set `GEMINI_MAX_CONCURRENCY` to change this. Optional `GEMINI_RPM` and `GEMINI_INPUT_TPM` mirror your actual project quotas; these pace requests and do not impose a smaller model output budget. Limits are process-local: running several worker processes requires coordinated quota allocation. Provider 429s reduce concurrency with cooldown; successful calls gradually restore it.

Adjacent spreadsheet row units are paired (normally around 60 populated rows), then split by text size. PDFs retain page units. Independent inventory and audit workers run concurrently. Canonical checks retain every raw observation, and comparison/verification operate in packets of eight. An incomplete packet cannot silently drop checks.

Each worker has a separate live thread with its tools, progress summaries, status, collapse control, and focused view. Open **Questionnaire** for live checks, search/status filtering, original observations, verification results, and policy/quotation citations. Expand the panel to full screen for inspection. Clicking **View worker activity** focuses the corresponding worker even when older threads are hidden.

See [parallel runtime LLD](../docs/lld/03-parallel-review.md) for recovery, correctness gates, and current limitations. This release has no measured large-document speedup claim; test the same documents and scope before comparing elapsed time and accuracy.

### Request efficiency

Comparison and verification requests intern identical resolved evidence objects once per request. Each check retains references to exactly its original evidence set; IDs, text and anchors are preserved. The compact representation is used only when it is smaller. This is serialization deduplication, not summarization or fewer verification checks. Original persisted tool outputs remain inspectable.

The default request concurrency is six (override with `GEMINI_MAX_CONCURRENCY`). Existing 429 backoff remains active. Step events record queue time and model duration in milliseconds alongside token usage. Restart the worker after changing code/configuration before measuring a new run.
