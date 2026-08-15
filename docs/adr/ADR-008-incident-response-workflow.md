# ADR-008: Durable incident-response workflow

## Status

Accepted for the controlled-pilot foundation. External monitoring and alert transport remain disabled.

## Decision

Reyati records operational incidents in a protected D1 register with explicit severity, category, accountable operator, response target, lifecycle state, and optimistic version. Every transition appends an immutable privacy-minimized timeline item, an audit event, and an operator notification. Only active platform administrators and security auditors may read or change the register.

Incidents may currently be declared only by an authorized operator. The response target is derived from the incident-response ownership assignment when present. Summaries and timeline notes must describe operational impact without clinical content, documents, authentication secrets, or unnecessary personal identifiers.

## Consequences

The platform now has a persistent process for declaration, acknowledgement, containment, monitoring, resolution, closure, and reopening. This does not provide monitoring coverage, automated detection, a security alert transport, or a staffed on-call service. Those remain launch blockers until a vendor, data-processing boundary, thresholds, transport, and rehearsed rota are approved and connected.
