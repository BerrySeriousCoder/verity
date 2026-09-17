# Local API

Fastify composition root and HTTP routes for PDF/CSV/XLSX uploads, source extraction inspection/search, evidence lookup, and durable review control. Domain behavior lives in `@verity/core`; PostgreSQL lives in `@verity/database`; immutable local file storage lives in `@verity/storage`; structure inspection is an adapter.

`buildApp` accepts dependencies for isolated tests. `server.ts` loads real adapters, binds to localhost:3001, and closes the pool on shutdown. Apply migrations before startup. This single-user slice refuses production mode and does not implement authentication. Tests use temporary PostgreSQL schemas and original PDF fixtures generated in memory.
