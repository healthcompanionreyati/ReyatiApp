# ADR-007: Pilot ownership and evidence register

- Status: Accepted
- Date: 2026-08-15

## Context

Implemented controls and written procedures do not establish operational accountability. A controlled pilot needs named primary and backup owners, measurable response targets, a clear escalation path, and recent evidence that critical procedures were rehearsed.

## Decision

Reyati stores one versioned assignment per critical pilot control. Only platform administrators may create or change assignments; security auditors receive a read-only view. Every owner must hold an active platform role, the backup must differ from the primary owner, response targets are bounded from 5 to 1,440 minutes, and verified evidence requires both a bounded reference and a non-future rehearsal date.

Saving an assignment notifies primary and backup owners and appends a privacy-minimized audit event. The readiness centre derives incident-ownership clearance only when both incident response and security alerting have primary and backup owners with verified evidence rehearsed in the previous 90 days. Recovery clearance uses the same rule for backup and restore. Ownership never overrides monitoring-vendor, regulatory, or clinical-data blockers.

## Consequences

Readiness can no longer be asserted by changing a label. It is derived from durable ownership and recent evidence. The register still requires governance outside the product: role holders must be approved, evidence references must point to authoritative records, and expired or misleading evidence must be challenged by the security-audit function.
