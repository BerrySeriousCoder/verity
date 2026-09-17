# Background worker

Runs separate extraction and review polling loops against PostgreSQL. Jobs use lease tokens; only the current owner can persist results. Review checkpoints survive restarts, cancellation invalidates the lease, and failed runs can resume committed steps. Originals are read from `@verity/storage`.

Gemini uses `@google/genai` through `@verity/agent`. Put `GEMINI_API_KEY` in the root project `.env`; model names are configurable and snapshotted per run. No test model is available in the production worker.
