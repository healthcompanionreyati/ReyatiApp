# ADR-005: Controlled-pilot organization suspension

- Status: Accepted
- Date: 2026-08-15

## Context

A controlled healthcare pilot needs a fast, reversible way to stop an organization from appearing in discovery, receiving new bookings, or using provider workspaces. Deleting the organization or rewriting its memberships would destroy evidence and make rollback unsafe. Suspending individual members is too narrow for an organization-wide incident.

## Decision

Platform administrators can suspend an active organization and reactivate a suspended organization from the protected organization-control workspace. Both transitions require a 10–500 character operational reason, use the organization verification version as an optimistic concurrency boundary, and append a privacy-minimized audit event.

Existing authorization, provider-catalog, discovery, and booking queries already require an active organization. Changing the organization status therefore closes those operational paths at their shared server-side boundary. Suspension retains the organization, facilities, memberships, provider profiles, appointments, clinical records, and financial records. It does not silently cancel or reschedule existing appointments. Reactivation restores only the active status; it does not recreate records or bypass independent provider verification.

The interface uses a two-stage bilingual confirmation. It states the immediate effect, the retained-data consequence, and the need to coordinate existing appointments through support.

## Consequences

The platform gains a reversible containment control with stale-write protection and an auditable reason. Pilot operations still require an approved suspension procedure, a named decision owner, a patient-contact process for affected appointments, and a rehearsed rollback. Automated appointment cancellation is intentionally excluded because it would be a separate high-impact workflow requiring notification and clinical continuity controls.
