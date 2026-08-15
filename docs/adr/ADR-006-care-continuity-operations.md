# ADR-006: Durable care-continuity operations

- Status: Accepted
- Date: 2026-08-15

## Context

Suspending a provider organization must stop discovery, new bookings, and provider access immediately, but silently cancelling existing appointments would create a separate patient-safety risk. A support inbox alone cannot prove that every affected appointment was identified and handled.

## Decision

When an organization is suspended, Reyati creates one durable continuity case for every future pending or confirmed appointment belonging to that organization. Appointment uniqueness makes repeated suspension safe and prevents duplicate cases. The queue is visible only to active platform administrators and support agents.

Continuity actions are version checked, assigned to an accountable operator, and audited without placing the operational note in audit metadata. Operators may record patient contact, request patient-led rebooking, or resolve a case. Only platform administrators may cancel an affected appointment. Cancellation updates the appointment, releases its slot locks, preserves its history, and sends privacy-minimized account notifications to the patient and provider. It does not imply payment or refund movement.

## Consequences

Organization containment now produces an explicit follow-up workload instead of leaving affected appointments implicit. Rebooking remains a patient choice because automatically moving an appointment could select an unsuitable provider, time, facility, or consent context. Outbound email remains gated, so the controlled-pilot operating procedure still needs named owners, response targets, an approved contact script, and rehearsal evidence.
