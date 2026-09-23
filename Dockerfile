FROM node:22.20.0-bookworm-slim AS build
WORKDIR /app/project
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
COPY project/package.json project/pnpm-lock.yaml project/pnpm-workspace.yaml ./
COPY project/apps/api/package.json apps/api/package.json
COPY project/apps/web/package.json apps/web/package.json
COPY project/apps/worker/package.json apps/worker/package.json
COPY project/packages/agent/package.json packages/agent/package.json
COPY project/packages/core/package.json packages/core/package.json
COPY project/packages/database/package.json packages/database/package.json
COPY project/packages/ingestion/package.json packages/ingestion/package.json
COPY project/packages/storage/package.json packages/storage/package.json
RUN pnpm install --frozen-lockfile
COPY project/ ./
RUN pnpm build

FROM node:22.20.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends tini gosu ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/project
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 BLOB_DIRECTORY=/data/blobs SEED_DEMO_DOCUMENTS=true
COPY --from=build --chown=node:node /app/project /app/project
COPY --chown=node:node testdoc/dummy/demo-policy.pdf testdoc/dummy/demo-placement-slip.xlsx /app/testdoc/dummy/
COPY project/scripts/runtime/entrypoint.sh /usr/local/bin/verity-entrypoint
RUN chmod +x /usr/local/bin/verity-entrypoint
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--", "verity-entrypoint"]
