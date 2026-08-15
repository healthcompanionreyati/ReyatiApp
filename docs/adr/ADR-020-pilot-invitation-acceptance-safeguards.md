# ADR-020: Pilot invitation and acceptance safeguards

- Status: Accepted implementation foundation
- Date: 2026-08-16

## Decision

Reyati prepares invitation safeguards as independently reviewed policy records before any invitation runtime is activated. Each policy belongs to one controlled-pilot plan and one participant type, binds the exact approved patient-consent or provider-agreement artifact, and versions its expiry and reissue limits.

Every policy fixes the non-negotiable controls: account-user and verified-email identity binding, single use, hash-only token storage, acceptance-locale capture, and withdrawal handling. A preparer cannot approve their own policy. Approval revalidates the bound enrollment artifact and retires the previously approved policy for that participant type.

This foundation does not generate or store invitation tokens, deliver invitations, record participant acceptance, or grant pilot access. Those four runtime effects remain independently disabled and require a later activation review.

## Consequences

Operators can review the complete safety contract and exact consent-version dependency without creating a participant pathway. Audit and notification records describe policy state only and cannot contain invitation secrets because no secret exists at this stage.
