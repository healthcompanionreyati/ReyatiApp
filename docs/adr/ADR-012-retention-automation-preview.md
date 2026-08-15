# ADR-012 — Retention automation preview

## Status

Accepted as a controlled-pilot execution foundation. Automated deletion remains disabled.

## Decision

Reyati introduces a durable, independently reviewed automation plan for the medical-document record class. The plan binds an approved lifecycle policy to a bounded cadence, batch size, external schedule reference, and accountable owner. Owners cannot approve their own plan.

Approved plans permit aggregate-only preview runs. A preview examines at most 100 deletion-eligible records, rechecks the durable legal-hold register, and records only examined, eligible, and hold-excluded counts. It does not change retention state, create deletion jobs, expose document identifiers, invoke storage, or delete bytes.

## Consequences

Operators can validate policy linkage, expected volume, and hold exclusions before activation. Scheduled execution, deletion-job creation, external scheduler configuration, and the deletion processor remain independently gated and hard disabled. Formal legal review and an explicit activation decision are still required.
