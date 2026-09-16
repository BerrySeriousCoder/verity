# Component name

Status: Draft

## Purpose and worked example

Explain the problem in plain language. Walk one realistic input through the component to its output.

## Responsibilities and boundaries

What it owns, callers, dependencies, and what another component owns.

## Invariants

List properties that must hold even during retries, failures, and concurrent requests.

## Data model

Types/tables, field meanings, identifiers, constraints, indexes, versioning, and retention. Explain why each important design choice exists.

## Interfaces

Input/output examples, validation, error types, access checks, pagination/limits, and idempotency behavior.

## Algorithm and transitions

Pseudocode or sequence diagram. Identify transaction boundaries and external calls.

## Failure and recovery

Malformed inputs, partial results, dependency timeouts, duplicate delivery, crashes, stale data, and cancellation. Separate retryable failures from permanent failures and unknown outcomes.

## Alternatives and tradeoffs

Chosen proposal, alternatives considered, operational cost, and what evidence would change the decision.

## Verification and observability

Meaningful fixtures, invariants to test, trace fields, metrics, and explicit acceptance criteria. Document semantic uncertainty separately from mechanical correctness.

## Learning notes

Define unfamiliar concepts, explain the mechanism, and show one failure that a simpler approach would allow.

## Open questions and implementation links

Unresolved decisions first. Add code and actual validation results only after implementation.
