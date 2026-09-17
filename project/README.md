# Development workspace

This pnpm workspace contains the modular monolith. Git lives one directory above so code and architecture decisions share history.

## Run locally

Use Node 22.20.x (or a later Node 22 release), pnpm 10.8.0, and Docker.

```sh
cd project
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
cp -n .env.example .env
# Set GEMINI_API_KEY in .env before starting model-backed reviews.
pnpm dev
```

Open **http://127.0.0.1:3000**. Next.js serves the workspace and forwards `/api` to the local Fastify API on port 3001. The API and frontend bind to localhost; a background worker handles extraction and reviews. Upload digital PDFs, UTF-8 comma-separated CSVs, or XLSX files up to 20 MiB. Wait for extraction, choose a policy and quotation documents, and describe the checks. Vague tasks pause for scope confirmation. Findings link to PDF regions or spreadsheet rows. Original files are never edited.

The API seeds one local workspace after explicit migrations. Identical bytes reuse a document record within that workspace; different bytes with the same filename get a new identity. Document metadata lives in PostgreSQL; original bytes live in ignored `project/.data/blobs/`.

Docker Compose uses `postgres:16-alpine`, a named volume, and `127.0.0.1:55432`. Database/user: `verity`; local password: `verity_local_only`. Copy `.env.example` to `.env` for overrides; the API, worker, and migration commands load that file. Restart the app after changing environment settings. Keep `DATABASE_URL` consistent with any changed Compose settings. These credentials are local defaults, not production secrets.

`pnpm db:down` stops PostgreSQL without deleting its volume. Stop `pnpm dev` with Ctrl+C. Preserve both the database and blob directory to retain uploads. No garbage collection or destructive reset command is provided.

## Boundaries

| Location             | Responsibility                                                                   |
| -------------------- | -------------------------------------------------------------------------------- |
| `apps/web`           | Next.js App Router, Tailwind UI components, client-only PDF.js viewer            |
| `apps/api`           | Fastify HTTP validation, uploads, evidence and review routes                     |
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

Integration/browser tests use `TEST_DATABASE_URL` when provided, otherwise the default local database. Test credentials need schema creation privileges. Tests remove only their generated schemas and temporary blob directories. Browser tests need ports 3000 and 3001 free, start their own servers, and do not reuse a running application. Screenshots/traces are ignored under `test-results/`. CI runs these checks against PostgreSQL.

The later agent evaluation benchmark is separate from engineering tests. Use reviewed forward migrations for schema changes; never edit applied SQL files. Do not commit credentials, uploaded originals, generated browser output, or private fixtures.

## Current limits

This is a single-user development application without authentication. The API refuses production mode and binds only to localhost; workspace filtering does not replace authorization. Shared deployment requires authentication, membership enforcement, operational resource limits, backups, and recovery work.

The review implementation is under validation. Engineering tests use a deterministic model double; they test orchestration and do not establish Gemini accuracy. Live Gemini validation is still pending a locally configured API key. Model choice is configurable through `GEMINI_MODEL` and `GEMINI_AUDITOR_MODEL`; defaults follow Google's current documented example. External model calls incur provider charges and send the selected source excerpts to Gemini.

No OCR, scanned-image interpretation, corrected-document generation, external actions, formula execution, or post-MVP benchmark platform. Empty text pages and missing spreadsheet formula caches remain explicit source limitations. PDF text reading order and table relationships can still need manual inspection. XLSX archives are checked against 32 MiB per-entry / 100 MiB total actual expansion limits before parsing. Parsing is still in-process and not yet suitable for hostile public uploads. The workbook parser's UUID dependency is pinned to a patched compatible release through a scoped pnpm override.

Review budgets: 1,500 model calls / 5 million accounted tokens per run, 16 investigation steps per obligation, 100,000 input characters per model call, and two hours per worker attempt. An exhausted budget is an incomplete review, never an alignment result. Calls interrupted before checkpoint commit can repeat on recovery. Independent model contexts reduce shared context bias but do not guarantee independent errors or complete semantic coverage.

A source block must appear in an obligation or a reasoned exclusion in both independent inventory passes. Their obligation union is preserved; only exact duplicates are collapsed. Reading all blocks is measurable; correctly identifying every clause is still a model-quality question. Clarification responses currently trigger conservative re-verification of all findings because semantic dependencies are not yet modeled explicitly. Inputs and model names are pinned for a run; changed documents or a changed agreed scope require a new review.
