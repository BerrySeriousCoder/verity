# Web workspace

Next.js App Router with Tailwind utilities. `src/app` owns routing/layout; `App.tsx` coordinates workspace state; reusable components own document navigation and UI controls. PDF.js is dynamically loaded with SSR disabled because its renderer needs browser APIs. Its bundled worker is served locally.

Run from the monorepo root with `pnpm dev`. The local web server is on port 3000 and proxies `/api` to port 3001. Authentication and review/chat workflows are not implemented yet. Keep component styling in Tailwind utilities; the only global CSS is the Tailwind import.
