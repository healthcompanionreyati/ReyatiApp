# ADR-032: Controlled-pilot participant journey rehearsal

## Status

Accepted — 2026-08-25

## Context

Qivaya has independently reviewed enrollment, invitation-safeguard, participation, withdrawal, cohort, launch, and command evidence. Real participant invitation, acceptance, access, lifecycle, launch, and command runtimes intentionally remain disabled. Operators still need one durable way to prove that the designed participant journey composes correctly before any live-runtime implementation is considered.

## Decision

Add a protected Participant Journey Rehearsal for platform administrators and security auditors. It derives ten prerequisites from existing server-owned evidence and operates only on cohort members bound to pre-provisioned `synthetic:provider:*` or `synthetic:patient:*` identities.

The administrator may run an idempotent, zero-effect rehearsal. One privacy-minimized audit record is appended per synthetic cohort member plus one aggregate run record and an in-app operator notification. The coded record proves the simulated sequence—identity binding, invitation preparation, acceptance evaluation, scoped-access evaluation, withdrawal, and revocation—without changing any source record. A downloadable aggregate JSON pack exposes the gates and runtime boundaries without participant identity, clinical data, or invitation secrets.

The existing audit ledger is used as the append-only rehearsal register. This avoids introducing a new mutable runtime table or a production migration before a real participant lifecycle has been separately designed and approved.

## Safety boundary

- All seven participant and pilot runtime flags must remain disabled or the rehearsal is blocked.
- No invitation token or acceptance record is created.
- No email, SMS, webhook, or other external delivery occurs.
- No role, permission, cohort state, participant status, or patient/provider profile changes.
- Only synthetic identities can receive rehearsal evidence.
- Audit metadata contains coded participant type and aggregate controls only; identity and clinical data are excluded.
- A passing rehearsal is evidence, not authorization for a live pilot.

## Consequences

Operators gain a coherent, independently inspectable participant-control checkpoint and investors can see the intended lifecycle without exposing real users. Live participant runtime work remains a separate gated decision that requires a durable token and acceptance model, delivery controls, access-enforcement design, revocation integration, and production approval.
