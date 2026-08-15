# ADR-022: Pilot readiness evidence integration

- Status: Accepted
- Date: 2026-08-16

## Decision

The controlled-pilot Go/No-Go decision is derived from current server-side evidence. In addition to application safety, ownership, monitoring, recovery, and data-lifecycle controls, readiness now includes four non-overridable product gates:

1. Current independently approved patient-consent and provider-agreement artifacts.
2. Current patient and provider invitation safeguards bound to those exact approved artifacts.
3. Current patient and provider participation policies bound to approved invitation safeguards, each with an independently verified passing withdrawal rehearsal from the last 90 days.
4. Independently approved definitions for all six required pilot success metrics.

Every gate exposes a protected evidence route. An immutable review snapshot preserves the route and evidence text that existed when it was created. A Go decision re-evaluates the current gates and requires both the historical snapshot and the current state to contain zero blockers.

Readiness requires metric definitions, not measured outcomes. It does not activate invitation delivery, participant acceptance, access grants, participant lifecycle execution, or real feedback collection.

## Consequences

Completing a workspace cannot bypass the launch decision. Retiring a bound artifact, allowing rehearsal evidence to age beyond 90 days, or losing any other current dependency blocks a later Go decision even when an earlier snapshot showed it as cleared.
