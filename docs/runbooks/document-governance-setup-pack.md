# Document governance setup pack

## Purpose

The setup pack prepares the missing medical-document governance drafts in one repeatable operation. It reduces manual setup work without turning a proposal into an approval.

## Access and boundaries

- Platform administrators may prepare the pack.
- Security auditors may read the live coverage but cannot prepare drafts.
- Existing lifecycle policies and retention plans are never overwritten.
- The operation grants zero approvals, changes zero runtime flags, reads zero patient records, touches zero R2 objects, and makes zero external calls.
- Proposed durations and references are operational starting points, not legal advice or evidence of legal compliance.

## Prepared records

The pack creates a draft only when the record class is absent:

1. Finalized encounters — 120 months from encounter finalization, archive then review.
2. Medical documents — 120 months from record creation, archive then review.
3. Appointment records — 60 months from appointment completion, review then delete.
4. Audit and security events — 84 months from event recording, archive then review.
5. Communications metadata — 36 months from record creation, review then delete.

It also creates a weekly, 25-record medical-document retention-plan draft when no plan exists. A plan draft may be prepared against a non-retired lifecycle-policy draft, but it cannot be submitted until the medical-document policy is independently approved.

## Procedure

1. Open `/admin/document-governance-setup` as a platform administrator.
2. Select an active privileged owner.
3. Confirm the legal-review and evidence prefixes are coded internal references with no secrets or patient data.
4. Confirm proposal-only handling and prepare the pack.
5. Open Data lifecycle, validate every proposed term with legal/privacy owners, edit where required, and submit each policy.
6. A different eligible operator independently approves or rejects each policy.
7. Open Retention automation, validate the bounded plan, submit it after the medical-document policy is approved, and complete independent review.
8. Return to the Medical document launch command centre. Readiness recalculates from durable approved evidence only.

## Idempotency and recovery

Running the pack again performs a live coverage check. Existing records remain unchanged and only missing drafts are created. If another operator creates coverage concurrently, refresh and run the pack again; the unique record-class constraints and conflict response prevent duplicate governance records.

## Audit evidence

Every created policy and plan writes its native event, audit entry, and owner notification. A summary `document_governance_setup.prepare` audit event records aggregate creation counts and zero-side-effect boundary counters. No patient identifiers or document identifiers are stored in the setup evidence.
