# Development workspace

This pnpm workspace contains the modular monolith. Git lives one directory above so code and architecture decisions share history.

## Setup

Use Node 22.20.x (or a later Node 22 release) and pnpm 10.8.0.

```sh
cd project
pnpm install --frozen-lockfile
pnpm check
pnpm db:up
```

Docker Compose uses the existing `postgres:16-alpine` image. The development database is `verity`, available at `127.0.0.1:55432`, with username `verity` and password `verity_local_only`. These defaults are for local development only. Copy `.env.example` to `.env` to override Compose settings. A named volume preserves data across `pnpm db:down`; that command does not delete data.

Database migrations and the application connection configuration will be added with the first persisted feature. No application server or worker exists yet.

## Boundaries

| Location            | Responsibility                                                    |
| ------------------- | ----------------------------------------------------------------- |
| `apps/web`          | Review workspace, chat, findings, document viewers                |
| `apps/api`          | HTTP contracts, authentication, application composition           |
| `apps/worker`       | Background ingestion and durable review execution                 |
| `packages/core`     | Domain rules and use cases, without UI or database-driver imports |
| `packages/database` | PostgreSQL repositories and versioned migrations                  |
| `evals`             | Reserved documentation for post-MVP evaluation work               |

API and worker are entry points for one modular backend, not independent microservices. Introduce domain modules for documents, evidence, review coverage, comparisons, and clarifications as their first working slices are built. Do not populate empty abstractions in advance.

Applications may consume packages. Packages must not import applications. Domain logic depends on explicit persistence/model interfaces; adapters implement them. Browser code must never import server/database implementations. Keep modules' internals private and expose intentional public interfaces as modules are introduced.

## Checks and development

`pnpm check` checks formatting and strict TypeScript. CI runs the same checks with a frozen lockfile. Meaningful unit and PostgreSQL integration tests begin with the first implemented behavior; there are no fabricated passing tests in this foundation. The later agent evaluation benchmark is separate from engineering tests.

Use reviewed, forward migrations for schema changes. Test database behavior against PostgreSQL rather than a SQLite substitute. Never commit uploads, credentials, local database files, or customer documents. Production authentication, deployment, secrets, backups, and observability remain future implementation work; this scaffold is not a production-ready service.
