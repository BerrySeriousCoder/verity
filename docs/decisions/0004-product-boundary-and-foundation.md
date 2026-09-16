# 0004 — Review-only product and monorepo foundation

Status: Product boundary accepted by user; foundation choices selected during authorized initialization, 2026-09-17.

## Product boundary

Verity checks documents, compares evidence, collects clarification, and produces review findings and reports. It never produces corrected source documents. External communications, payments, source-document editing, and outbound action approval flows are outside the product, not merely deferred MVP features. Earlier brainstorming about those flows is superseded.

The evaluation harness and benchmark are deferred until after the MVP. Engineering tests begin with implemented behavior. Preserve provenance and structured execution records as features are built so later evaluation does not require reconstructing missing history.

## Foundation

Code lives in `project/`, a pnpm workspace using strict TypeScript. The outer Git repository tracks both architecture documents and code. Keep web, API, and worker entry points distinct; the backend is a modular monolith sharing domain logic and PostgreSQL. Frameworks, model providers, and database driver remain undecided until their implementation slices.

Use PostgreSQL in development and production. Development Compose reuses the installed `postgres:16-alpine` image with an isolated named volume and localhost port 55432. The image tag permits patch updates; production image digest and update policy remain deployment decisions.

SQLite is a capable embedded database, but this project's shared state and concurrent background writes favor a client/server database and consistent development/production behavior. See [SQLite's usage guidance](https://www.sqlite.org/whentouse.html) and [PostgreSQL concurrency documentation](https://www.postgresql.org/docs/current/mvcc.html). This is a workload choice, not a claim that SQLite cannot be used in production.

## Development discipline

Use a committed dependency lockfile, strict type checking, formatting checks, CI, explicit module boundaries, and coherent local commits. Add meaningful unit/integration tests with actual behavior; add database migrations with the first data model. Do not scaffold an entire unimplemented domain behind placeholder interfaces.

Initial structure is not a production-ready deployment. Authentication, migrations, recovery, backups, resource limits, and observability need implementation and validation as the product is built.
