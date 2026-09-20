# 0007 — Prompt-first agent workspace with durable activity

Status: Accepted by explicit user correction and implemented, 2026-09-20.

## Context

The first review UI required users to choose policy and quotation roles in a form and then moved through dashboard panels. The intended interaction is closer to a coding agent: attach files, explain the task and file roles in natural language, submit once, and watch the agent inspect sources, plan, call tools, verify findings, and ask only necessary follow-up questions.

The interface also needs honest visibility. Users should see actual tool inputs and outputs and concise streamed progress, but model-private chain-of-thought is neither required nor an appropriate application artifact.

## Decision

Make the conversation composer the primary task entry point. A task starts with one prompt and at least two attached documents. The agent resolves document roles from the prompt, filenames, and bounded previews; ambiguity moves the run to `needs_context` and asks in the same conversation.

Persist every user message, public progress update, model step, tool call/result, finding, question, and status transition as an ordered `review_event`. Stream those records through resumable server-sent events. The UI renders a Codex-like timeline, expandable real tool activity, findings, and clickable citations beside the source inspector. Reloading restores the active task and replays its durable event history.

Gemini responses use an envelope containing a short `publicSummary` before the private structured result. Only that deliberately authored progress summary is streamed to the user. The complete structured output is validated and checkpointed for the harness; hidden reasoning is not exposed or represented as a tool trace.

## Consequences

- A role-selection form is no longer the main flow. Existing structured review endpoints remain temporarily for compatibility and tests.
- PostgreSQL is the source of truth for conversation history. SSE transports persisted state; it is not the durable record.
- The browser can reconnect using event IDs and receives periodic run snapshots for status/report changes.
- Tool payloads are inspectable and capped before persistence. Source excerpts sent to tools can therefore appear in local run history.
- Users can reply only when a run explicitly needs document context, scope confirmation, or clarification. A new instruction after a terminal run starts a new task.
- Stop maps to durable cancellation. Retry remains available for failed or cancelled tasks.
- Gemini accepts only a subset of JSON Schema. Verity sends a conservative provider schema and then enforces the complete Zod contract after generation.

## Validation

PostgreSQL integration tests cover prompt-first creation and durable messages/events. Browser tests cover multi-file attachment, prompt submission, live activity, expandable tool calls, findings, PDF citation highlighting, report access, reload restoration, and mobile navigation. A live Gemini smoke test now completes the full reviewer/auditor workflow with the configured local credential.

Related: [review runtime](../lld/02-evidence-review-runtime.md), [review interface](../lld/09-review-interface.md), and [ADR 0006](0006-gemini-and-durable-review.md).
