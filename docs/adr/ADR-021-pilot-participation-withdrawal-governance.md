# ADR-021: Pilot participation and withdrawal governance

- Status: Accepted implementation foundation
- Date: 2026-08-16

## Decision

Reyati defines the participation lifecycle before enabling participant acceptance. A versioned policy belongs to one controlled-pilot plan and participant type and binds an exact approved invitation-safeguard policy. It fixes short access-revocation and acknowledgement targets, a support follow-up target, authenticated self-service and assisted withdrawal paths, required-record preservation, and a prohibition on silent reactivation.

Returning after withdrawal requires a new identity-bound invitation and fresh acceptance of the then-current approved enrollment artifact. Policy approval requires independent review and revalidation of the bound invitation policy.

Operators may record synthetic withdrawal rehearsals without participant identifiers. A rehearsal measures access-revocation time, acknowledgement time, and outstanding actions against the approved policy. A different reviewer must verify a passing rehearsal. Failed rehearsals cannot be verified.

No real participant lifecycle, acceptance, withdrawal, access revocation, or reactivation is executed by this foundation. Runtime activation remains a separate decision.

## Consequences

The pilot can prove its withdrawal procedure and accountability targets before involving participants. Required records are not confused with active access, and withdrawal cannot be reversed without a new explicit participation decision.
