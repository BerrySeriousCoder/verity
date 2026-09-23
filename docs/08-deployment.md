# Docker and Railway deployment

This packages the current **single shared workspace** behind HTTP Basic authentication. It is suitable for a private test/demo deployment; there are no separate user accounts or tenant isolation. Use Railway's HTTPS URL and a unique deployment password. The API and worker stay internal; only the authenticated gateway has a public port.

## Railway

1. Add a PostgreSQL service to a Railway project. Add this GitHub repository as an application service; keep the repository root `/` (not `/project`). The root `Dockerfile` and `railway.json` configure the build and `/healthz` readiness check.
2. Attach an application volume at **`/data`**. The PostgreSQL service has its own database volume. Run one application replica because uploaded files use the application volume.
3. Set application variables:

   | Variable                              | Value                                                                             |
   | ------------------------------------- | --------------------------------------------------------------------------------- |
   | `DATABASE_URL`                        | `${{Postgres.DATABASE_URL}}` (replace `Postgres` with your database service name) |
   | `GEMINI_API_KEY`                      | Your Gemini key, as a Railway secret variable                                     |
   | `APP_USERNAME`                        | Your chosen login, e.g. `verity`                                                  |
   | `APP_PASSWORD`                        | A unique password of at least 16 characters                                       |
   | `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | `25`                                                                              |

4. Generate a public domain on the application service and deploy/redeploy. The runtime uses `RAILWAY_PUBLIC_DOMAIN` automatically. For a custom domain set `PUBLIC_ORIGIN=https://your-domain.example` explicitly. Open that URL and sign in using the configured credentials.

Startup waits for PostgreSQL, applies checksum-verified migrations under an advisory lock, creates the workspace idempotently, and seeds the two fictional demo documents. It then starts Next.js, the API and the review/extraction worker. Seeding creates no review and makes no Gemini calls. `SEED_DEMO_DOCUMENTS=false` disables demo uploads; workspace initialization remains automatic. Original private reference documents and `.env` files are excluded from the image.

Railway volumes mount as root. The entrypoint creates/chowns the blob directory, then drops privileges to the `node` user before migrations and application startup. All services share that blob directory. A child-process exit stops the whole service so Railway can restart it; review checkpoints live in PostgreSQL. `/healthz` checks both HTTP services and the worker process, without exposing workspace contents.

The Dockerfile retains the workspace TypeScript runtime and dependencies, because internal packages export TypeScript. No build-time API keys are needed. Migrations and seeding run at container startup, not during image builds or pre-deploy (when the data volume is unavailable).

## Local full Docker stack

Set `GEMINI_API_KEY`, `APP_USERNAME` and `APP_PASSWORD` in `project/.env`, then run from the repository root:

```sh
docker compose --env-file project/.env up --build -d
```

Open **http://localhost:8080** and sign in. The root Compose stack uses its own database and document volumes; it does not replace the existing `project/compose.yaml` development database. `APP_PORT` changes the local URL port. `DOCKER_DB_PASSWORD` optionally changes the local container DB password (use URL-safe characters).

```sh
docker compose --env-file project/.env logs -f app
docker compose --env-file project/.env down
```

Stopping without `--volumes` preserves uploaded files and reviews. Never delete these volumes to fix an application error.

## Compare short-run usage

The small fixture and its separate answer key are in `testdoc/dummy`. After a local review:

```sh
cd project
pnpm review:usage <run-id>
```

For Docker, run `node --import tsx packages/database/src/review-usage.ts <run-id>` in `/app/project` inside the app container. Missing cache telemetry on old runs is unknown, not zero. Compare identical documents and scope; a successful deployment is not a benchmark of insurance conclusions.

Railway references: [Dockerfile builds](https://docs.railway.com/builds/dockerfiles), [health checks and PORT](https://docs.railway.com/deployments/healthchecks), [volume startup/permissions](https://docs.railway.com/volumes), [configuration as code](https://docs.railway.com/config-as-code/reference).
