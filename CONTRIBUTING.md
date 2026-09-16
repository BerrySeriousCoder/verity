# Contributing

Work in small, reviewable slices. Update relevant design documents when behavior changes. Record consequential decisions in `docs/decisions`; distinguish proposals from implemented behavior.

Before committing, run `pnpm check` in `project/` plus the tests appropriate to the changed behavior. Inspect the staged diff for generated files, secrets, and unrelated changes. Commit coherent milestones with descriptive messages such as `docs: record review boundaries` or `feat(evidence): resolve immutable citations`. Do not rewrite shared history or push without explicit instruction.

Use strict types, explicit module interfaces, validated external inputs, and structured errors. Avoid broad utility dumping grounds, speculative service layers, and catch-all error suppression. Add dependency and test tooling when needed for actual behavior. Keep business rules independent of HTTP, UI, model vendors, and storage adapters.
