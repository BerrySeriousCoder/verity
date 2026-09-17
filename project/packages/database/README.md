# Database

PostgreSQL document repositories and ordered SQL migrations. Run `pnpm db:migrate` from `project/`. The runner uses a transaction and advisory lock, records checksums, and rejects changes to applied migrations. Startup seeds the single local workspace; migrations themselves contain no user documents.

All document reads are scoped by workspace ID. Identical content is unique within a workspace. This is data scoping, not authentication. Future shared deployment must enforce workspace membership before invoking these repositories.
