# ADR-009: Independently reviewed recovery rehearsal evidence

## Status

Accepted for the controlled-pilot foundation.

## Decision

Reyati records database, document-storage, and full-platform recovery rehearsals in a durable protected register. Rehearsals are explicitly limited to an isolated hosted recovery environment using synthetic data. Platform administrators plan, start, complete, or cancel a rehearsal. An active platform administrator or security auditor other than the rehearsal owner reviews the evidence.

Verified evidence requires a completed integrity check, an evidence reference, measured recovery time within the declared RTO, and recovery-point age within the declared RPO. Every step uses optimistic concurrency, an append-only evidence event, a privacy-minimized audit event, and an operator notification.

The pilot recovery gate clears only when backup-and-restore ownership is current and a full-platform rehearsal has independently verified evidence from the previous 90 days within both targets.

## Consequences

The product can coordinate and verify recovery exercises without claiming that it invokes Cloudflare backup or restoration APIs. An operator must perform the isolated restore and enter an authoritative evidence reference. Real-patient data must not be used in this workflow until hosting, residency, retention, and information-classification decisions are approved.
