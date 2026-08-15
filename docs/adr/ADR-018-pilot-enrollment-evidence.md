# ADR-018: Pilot enrollment consent and agreement evidence

- Status: Accepted implementation foundation
- Date: 2026-08-15

## Decision

Reyati stores versioned, plan-bound references for two controlled-pilot enrollment requirements: patient consent and provider agreement. Each reference records a controlled title, bounded scope summary, policy version, artifact reference, audience, preparer, independent reviewer, decision, timestamps, optimistic version, and immutable event trail.

Only a platform administrator may prepare an artifact. A different authorized administrator or security auditor must approve or reject it. Approval of a newer version retires the previously approved artifact of the same type. The platform does not invent or store binding legal wording in this workflow; the referenced artifact must come from the approved legal, privacy, clinical, or provider-contract owner.

Participant acceptance, invitation delivery, enrollment, and pilot access remain hard-disabled. Artifact approval is operational evidence only and must never be interpreted as participant consent.

## Consequences

The pilot can prove which consent and agreement versions are approved without overstating enrollment readiness. A later identity-bound acceptance workflow must preserve the exact approved version, participant identity, presented locale, acceptance time, withdrawal state, and audit evidence before invitations or participation can activate.
