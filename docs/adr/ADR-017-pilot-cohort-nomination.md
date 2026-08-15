# ADR-017: Eligibility-bound pilot cohort nomination

## Status

Accepted for implementation. Invitation delivery and participation remain disabled.

## Decision

An approved pilot plan may hold nominations for eligible existing accounts. Provider candidates must be active, verified, and belong to the plan organization. Patient candidates must have an active Reyati patient account. Duplicate nominations are rejected and active nominations cannot exceed the plan's provider or patient target.

Nomination is preparation only. It creates no token, sends no external email, grants no access, and does not mark an account as participating. Removal is optimistic, audited, and preserves history.

## Consequences

Operators can prepare a controlled roster using synthetic or approved accounts while activation remains fail closed. Invitation acceptance, consent, and participation activation require a later separately reviewed capability.
