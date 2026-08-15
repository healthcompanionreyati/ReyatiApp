# ADR-024: Pilot command centre and day-zero evidence

- Status: Accepted
- Date: 2026-08-16

## Decision

Controlled-pilot activation requires a current, independently completed day-zero command session in addition to the approved plan, Go decision, and launch authorization package.

Each session is bound to one versioned launch package and activation window. It captures the current readiness gates, uses the package's distinct primary owner as launch commander and backup owner as stop authority, and seeds ten mandatory checks: identity and access, provider roster, published services, scheduling capacity, participant support, consent versions, communications fallback, incident contacts, rollback access, and monitoring and recovery.

Every check needs a stable non-sensitive evidence reference and operator note. Submission requires an approved launch package, zero current and captured readiness blockers, and all ten checks verified. Completion requires an independent reviewer and an active shift window. A platform administrator or security auditor may abort an incomplete session immediately.

## Consequences

The command centre is a synthetic rehearsal surface and cannot activate the pilot, deliver communications, grant participant access, or execute rollback. The controlled-pilot activation transition separately and server-side revalidates a completed current session, active commander, and active stop authority. There is no override path for missing, stale, blocked, or out-of-window evidence.
