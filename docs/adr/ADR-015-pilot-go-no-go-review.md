# ADR-015: Fail-closed pilot go/no-go decisions

## Status

Accepted for implementation. This workflow does not declare the controlled pilot ready.

## Decision

Each decision cycle captures an immutable, privacy-safe snapshot of the server-derived pilot readiness gates. A platform administrator prepares and submits the snapshot. A different authorized operator records either a go or no-go decision with evidence.

A go decision is rejected unless every gate was cleared in the immutable snapshot and remains cleared when the reviewer decides. A no-go decision can always be recorded when a review is pending. Completed reviews are never edited; they may only be superseded by a later cycle.

## Consequences

Reyati gains an auditable decision register without converting implementation progress into a launch claim. External monitoring, alert transport, retention activation, hosted recovery evidence, and legal or operational blockers remain governed by their source controls.
