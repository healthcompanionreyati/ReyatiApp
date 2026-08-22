# ADR-010: Data lifecycle policy governance

## Status

Accepted as a controlled-pilot governance and enforcement foundation. Production execution remains disabled.

## Decision

Reyati maintains one durable policy for each required record class: finalized encounters, medical documents, appointments, audit and security events, and communications metadata. A policy records a bounded retention period, trigger, disposition, external legal-basis reference, approval-evidence reference, and accountable owner.

Platform administrators create and submit policy drafts. An active platform administrator or security auditor other than the policy owner independently approves or rejects them. Every transition is optimistic, append-only, audited, and notification-backed. A separately gated signed executor requires both an approved medical-document policy and approved automation plan. It selects only terminal-state documents whose deletion date has arrived, excludes active shares and access grants, evaluates record, account, organization, and record-class holds, creates one durable deletion job per document, and reuses the leased verified-deletion processor. Hold state is checked again after a job lease and broad-scope hold releases resume only jobs with no remaining active hold. Approved records alone do not activate deletion or establish regulatory compliance.

## Consequences

The platform can show which lifecycle decisions exist and who approved them while keeping enforcement fail-closed. Hourly scheduling and the execution boundary are implemented behind two production gates. Pilot readiness remains blocked until required policies are approved, destructive-operation rehearsals succeed, scanner activation is complete, and the accountable owners authorize production execution.
