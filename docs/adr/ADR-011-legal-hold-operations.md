# ADR-011 — Legal-hold operations

## Status

Accepted as a controlled-pilot governance foundation. Automated retention enforcement remains disabled.

## Decision

Reyati maintains a durable legal-hold order and immutable event trail for the five governed record classes. Platform administrators and security auditors may place an immediate hold with an opaque internal scope reference, bounded reason code, authority reference, accountable owner, and review date. A hold never expires automatically.

Release uses a two-step workflow. An active hold first moves to `release_pending`; approval must come from an active administrator or security auditor who is not the hold owner, placer, or release requester. Rejection returns the hold to `active`. Every transition is optimistic, audited, and notification-backed.

The dormant medical-document deletion processor checks the durable hold register before claiming work and again immediately before byte deletion. Record-class holds and exact-record holds both fail closed. The existing job flag remains a secondary operational interlock.

## Consequences

Operators can demonstrate accountable hold placement, periodic review, and independently approved release without entering patient names or clinical content. This workflow does not provide legal advice, establish compliance, activate retention schedules, or authorize deletion. Scanner activation, scheduled cleanup, formal legal review, and an explicit retention-enforcement activation decision remain separate blockers.
