# Contributing

Work in small, reviewable slices. Update relevant design documents when behavior changes. Record consequential decisions in `docs/decisions`; distinguish proposals from implemented behavior.

Before committing, run `pnpm check` in `project/` plus the tests appropriate to the changed behavior. Inspect the staged diff for generated files, secrets, and unrelated changes. Commit coherent milestones with descriptive messages such as `docs: record review boundaries` or `feat(evidence): resolve immutable citations`. Do not rewrite shared history or push without explicit instruction.

Use strict types, explicit module interfaces, validated external inputs, and structured errors. Avoid broad utility dumping grounds, speculative service layers, and catch-all error suppression. Add dependency and test tooling when needed for actual behavior. Keep business rules independent of HTTP, UI, model vendors, and storage adapters.

Frontend uses Next.js App Router and Tailwind utilities by user decision. Style reusable React components with Tailwind; do not introduce handwritten component stylesheets or CSS modules. The global CSS file contains only the Tailwind import. Dynamic PDF canvas dimensions are rendering geometry, not a replacement design system. Read the Next.js-generated frontend AGENTS.md and relevant installed framework documentation before changing frontend code.
