# ADR-010: Data lifecycle policy governance

## Status

Accepted as a controlled-pilot governance foundation. Automated retention and legal-hold enforcement remain disabled.

## Decision

Reyati maintains one durable policy for each required record class: finalized encounters, medical documents, appointments, audit and security events, and communications metadata. A policy records a bounded retention period, trigger, disposition, external legal-basis reference, approval-evidence reference, and accountable owner.

Platform administrators create and submit policy drafts. An active platform administrator or security auditor other than the policy owner independently approves or rejects them. Every transition is optimistic, append-only, audited, and notification-backed. Approved policy records do not activate document deletion, bypass legal holds, or establish regulatory compliance.

## Consequences

The platform can show which lifecycle decisions exist and who approved them while keeping enforcement fail-closed. Pilot readiness remains blocked until all required policies are approved and legal-hold operations, scanner activation, scheduled cleanup, retention enforcement, and formal legal review are operational.
