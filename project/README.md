# Development workspace

This pnpm workspace contains the modular monolith. Git lives one directory above so code and architecture decisions share history.

## Run locally

Use Node 22.20.x (or a later Node 22 release), pnpm 10.8.0, and Docker.

```sh
cd project
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
pnpm dev
```

Open **http://127.0.0.1:3000**. Next.js serves the workspace and forwards `/api` to the local Fastify API on port 3001. Both processes bind to localhost. Upload a PDF up to 20 MiB, select it, navigate pages, zoom, or download the unchanged original. Upload status does not imply extraction or review.

The API seeds one local workspace after explicit migrations. Identical bytes reuse a document record within that workspace; different bytes with the same filename get a new identity. Document metadata lives in PostgreSQL; original bytes live in ignored `project/.data/blobs/`.

Docker Compose uses `postgres:16-alpine`, a named volume, and `127.0.0.1:55432`. Database/user: `verity`; local password: `verity_local_only`. Copy `.env.example` to `.env` for overrides; the API and migration commands load that file. Restart the API after changing environment settings. Keep `DATABASE_URL` consistent with any changed Compose settings. These credentials are local defaults, not production secrets.

`pnpm db:down` stops PostgreSQL without deleting its volume. Stop `pnpm dev` with Ctrl+C. Preserve both the database and blob directory to retain uploads. No garbage collection or destructive reset command is provided.

## Boundaries

| Location            | Responsibility                                                        |
| ------------------- | --------------------------------------------------------------------- |
| `apps/web`          | Next.js App Router, Tailwind UI components, client-only PDF.js viewer |
| `apps/api`          | Fastify HTTP validation/composition and PDF/blob adapters             |
| `apps/worker`       | Reserved for future background review execution                       |
| `packages/core`     | Document use case, errors, types, and persistence interfaces          |
| `packages/database` | PostgreSQL repositories and transactional, checksummed migrations     |
| `evals`             | Post-MVP evaluation planning, no runner yet                           |

Applications consume packages; packages never import applications. Browser code imports domain types only, not server implementations. Future API and worker entry points share the modular backend. Add domain modules alongside real features, not speculative abstractions.

The frontend uses Tailwind utilities and reusable components. `globals.css` contains only the Tailwind import. No Vite, CSS modules, or handwritten component stylesheets are used.

## Checks

```sh
pnpm check                 # formatting, strict types, unit tests, Next.js build
pnpm test:integration      # actual PostgreSQL; creates/removes a random test schema
pnpm exec playwright install chromium
pnpm test:e2e              # isolated database schema + blob directory; real browser
```

Integration/browser tests use `TEST_DATABASE_URL` when provided, otherwise the default local database. Test credentials need schema creation privileges. Tests remove only their generated schemas and temporary blob directories. Browser tests need ports 3000 and 3001 free, start their own servers, and do not reuse a running application. Screenshots/traces are ignored under `test-results/`. CI runs these checks against PostgreSQL.

The later agent evaluation benchmark is separate from engineering tests. Use reviewed forward migrations for schema changes; never edit applied SQL files. Do not commit credentials, uploaded originals, generated browser output, or private fixtures.

## Current limits

This is a single-user development application without authentication. The API refuses production mode and binds only to localhost; workspace filtering does not replace authorization. Shared deployment requires authentication, membership enforcement, operational resource limits, backups, and recovery work.

PDF structural validation does not prove digital text availability or sanitize content. This slice can display an original PDF, but does not interpret scans, extract text, or claim any document has been checked. Original file serving currently transfers the full file. Spreadsheets, CSVs, citation regions, and review agents are later slices. Production bundle compilation does not mean the service is production-ready.
