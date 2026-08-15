# ADR-013 — Security alert routing

## Status

Accepted as an operational alerting foundation. External alert delivery remains disabled.

## Decision

Reyati maintains one durable alert route per approved operational signal type. Each route defines a severity threshold, response target, escalation time, destination alias, and distinct primary and backup owners. Platform administrators draft routes; an operator other than the primary owner independently approves or rejects them.

Approved routes may run synthetic drills. Drills create privacy-safe audit evidence and durable in-app notifications for both owners. They never call email, webhook, SMS, or another external transport and record `externalDelivered=false` explicitly.

## Consequences

Operators can validate routing ownership and escalation design without overstating monitoring coverage. A transport vendor, secret configuration, receiver verification, delivery/retry handling, 24/7 rota, and incident rehearsal remain required before external alerting can be activated.
