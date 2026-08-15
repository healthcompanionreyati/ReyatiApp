# ADR-023: Controlled-pilot launch authorization

- Status: Accepted
- Date: 2026-08-16

## Decision

An approved controlled-pilot plan and an approved Go decision are necessary but no longer sufficient to activate a pilot. A platform administrator must prepare a versioned launch authorization package containing an immutable current-readiness snapshot, a bounded activation window, distinct active primary and backup owners, a stable support reference, and rollback and participant-contact targets.

Before submission, all five required synthetic rollback scenarios must have independently verified passing evidence from the previous 90 days: organization suspension, publication stop, booking stop, participant contact, and access revocation. The preparer cannot review their own package or drills. Approval also rechecks that no readiness gate is currently blocked and that a current approved Go decision exists.

Package approval does not activate the pilot. The activation transition is fail-closed and revalidates the organization, Go decision, approved launch package, activation window, captured blocker count, and complete fresh rollback evidence on the server.

## Consequences

Launch evidence is durable, versioned, indexed, and auditable. Operators may rehearse with synthetic references while the wider platform remains blocked. A stale rehearsal, expired window, retired package, missing owner, blocked gate, or absent Go decision prevents activation without an override path.
