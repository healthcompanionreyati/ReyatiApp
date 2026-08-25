# ADR-031: Controlled-pilot activation orchestration

## Status

Accepted — 2026-08-25

## Context

Qivaya already has protected, persistent workspaces for pilot scope, cohort, enrollment evidence, invitation safeguards, participation and withdrawal, learning metrics, operational ownership, monitoring acceptance, hosted recovery, launch authorization, and day-zero command. Operators previously had to infer the sequence and readiness state while moving between those workspaces.

## Decision

Add a private Pilot Activation Centre that derives one ten-stage plan from the existing D1 evidence registers and the canonical operations-health readiness gates. The centre does not introduce a second readiness model or duplicate workflow state. It links each incomplete stage to its accountable workspace and exposes dependencies, evidence counts, and the next recommended action.

A platform administrator may prepare a synthetic rehearsal foundation. The idempotent accelerators can fill the bounded cohort exclusively from pre-provisioned `synthetic:provider:*` and `synthetic:patient:*` identities, and create only missing `draft` patient-consent, provider-agreement, and success-metric definitions marked `SYNTH-1.0`. Every nomination and draft receives immutable evidence, while each accelerator records an aggregate audit event and an in-app operator notification.

Authorized operators may download a point-in-time JSON evidence pack containing the aggregate plan, ten-stage progress, readiness gates, and runtime boundaries. The export contains no participant identity or clinical data and cannot change source evidence.

## Safety boundary

- No user, patient, or provider profile is created or changed; the accelerator adds only synthetic cohort nomination records up to the approved plan targets.
- No invitation token, acceptance, consent decision, message, email, or external request is generated.
- No access, organization publication, runtime flag, or pilot state is activated.
- Independent approval remains mandatory in each source workspace.
- All launch decisions remain fail-closed against the server-derived readiness gates.
- Security auditors and support agents have read access; only platform administrators can prepare synthetic nominations or drafts.

## Consequences

Operators gain a coherent activation journey while the existing evidence services remain the sources of truth. The centre can accelerate rehearsal preparation but cannot be used to bypass legal, clinical, security, privacy, recovery, monitoring, or maker-checker controls.
