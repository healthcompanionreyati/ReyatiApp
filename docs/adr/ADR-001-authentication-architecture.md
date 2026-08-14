# ADR-001: Authentication architecture

- Status: Proposed; decision required before public pilot
- Last reviewed: 2026-08-14
- Owner: TBD — Security and Engineering

## Context

The hosted Reyati prototype currently trusts authenticated ChatGPT/Sites identity headers and applies Reyati roles server-side. This is appropriate for the private hosted prototype, but it is not an independent consumer authentication system.

## Current decision

Keep the current hosted identity path active. Add only expand-only identity, contact-method, session, factor, and authentication-event tables. No sign-up, password, OTP, passkey, recovery, or independent session runtime is enabled by this milestone.

The current Sites/ChatGPT subject is now recorded separately from the Reyati user profile. Its email is classified as `provider_asserted`, not independently verified, and cannot qualify for outbound delivery.

## Decision required

Before a public pilot, select and document a managed identity provider, standards-based OIDC provider, or separately reviewed first-party service. The decision must cover MFA, recovery, revocation, identity linking, contact verification, abuse controls, auditability, residency, and incident response.

## Activation gates

- Threat model and independent security review completed.
- Recovery and support procedures approved.
- Qatar privacy, residency, and retention obligations confirmed by qualified counsel.
- Pilot roles, owners, monitoring, and rollback tested in isolation.
