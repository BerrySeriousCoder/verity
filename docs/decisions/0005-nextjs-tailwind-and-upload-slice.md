# 0005 — Next.js, Tailwind, and the first document slice

Status: Next.js and Tailwind explicitly selected by user; upload slice implemented, 2026-09-17.

## Frontend decision

Use Next.js App Router with Tailwind utilities. Build reusable React components; do not use handwritten component stylesheets or CSS modules. The global CSS file contains only Tailwind's import. Prettier's Tailwind plugin maintains class ordering. Vite was removed before the first feature commit.

Keep routing/layout in App Router, client interaction in workspace components, and PDF.js rendering behind a client-only dynamic import. Serve the PDF worker locally through the bundle rather than relying on a third-party CDN. Pixel dimensions calculated for canvas rendering are geometry, not custom visual styling.

References: [Next.js client components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs), and [PDF.js examples](https://mozilla.github.io/pdf.js/examples/). Installed Next.js documentation is also available under the frontend's `node_modules/next/dist/docs/`.

## Backend and identity

Fastify owns HTTP validation and dependency composition. Domain upload behavior lives in `@verity/core`; PostgreSQL repositories and checksummed SQL migrations live in `@verity/database`. A local blob adapter preserves original bytes under a content hash. A structural PDF parser validates files and supplies page counts; no OCR or evidence extraction occurs yet.

A document version has an immutable UUID, workspace ID, original-byte hash, display name, byte count, page count, and creation time. Duplicate content within a workspace reuses its identity, with database uniqueness handling concurrent uploads. Filenames never determine storage paths or revision relationships. Metadata creation follows atomic blob publication; failures may leave unreferenced blobs for later reconciliation, rather than risking deletion after an ambiguous commit.

## Scope and tradeoffs

The slice provides upload, listing, original-file access, page navigation, zoom, and reload persistence. It intentionally does not claim extraction, scan classification, review, citations, or semantic validation. Full files are currently transferred to the viewer; canvas rendering is one page at a time.

This is a loopback-only single-user development slice. No authentication or shared deployment is implemented. The API refuses production mode. A successful optimized frontend build verifies bundling, not production readiness. Future background workers will share the domain modules; no worker process is needed for this upload-only slice.

## Validation

Unit checks cover validation and persistence failure ordering. Integration checks use real PostgreSQL schemas for migrations, identity, duplicate races, byte preservation, invalid requests, and workspace scope. Browser checks exercise the real Next.js/API/PDF.js path and responsive layout. Evaluation infrastructure remains deferred until after the MVP.
