# Local API

Fastify composition root and HTTP routes for PDF upload, listing, and original-file access. Domain behavior lives in `@verity/core`; PostgreSQL lives in `@verity/database`; local file storage and PDF structure inspection are replaceable adapters.

`buildApp` accepts dependencies for isolated tests. `server.ts` loads real adapters, binds to localhost:3001, and closes the pool on shutdown. Apply migrations before startup. This single-user slice refuses production mode and does not implement authentication. Tests use temporary PostgreSQL schemas and original PDF fixtures generated in memory.
