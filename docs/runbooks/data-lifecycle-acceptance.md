# Production data-lifecycle acceptance

This procedure is a technical production-readiness control. It does not replace legal advice, regulatory approval, a records schedule, or clinical governance.

## Fail-closed prerequisites

Before an acceptance package can be submitted, Qivaya requires:

1. independently approved policies for all five required record classes;
2. an independently approved medical-document retention automation plan;
3. a passing 22-scenario synthetic retention safety rehearsal from the last 30 days with zero document, job, object, or external-call side effects;
4. no overdue active or release-pending legal-hold review;
5. production Vercel runtime, protected R2 configuration, and OPSWAT private-processing configuration;
6. upload cleanup, scan dispatch, scan polling, scan recovery, retention execution, and the deletion processor enabled;
7. observed Cloudflare schedules and a separately recorded isolated R2 rehearsal.

If any item becomes false before review, verification is rejected even when the submitted snapshot originally passed.

## Isolated R2 rehearsal boundary

- Use only a newly generated, synthetic object key dedicated to the rehearsal.
- Record the exact object key and checksum in the restricted operator evidence system; store only a coded evidence reference in Qivaya.
- Verify write, metadata, read checksum, exact-key delete, and confirmed absence.
- Never enumerate and delete a bucket prefix, reuse a customer document key, or use production patient data.
- Confirm that zero residual synthetic objects remain and that zero customer records were touched.

## Separation of duties

The platform administrator who prepares the package cannot verify it. A different active platform administrator or security auditor must independently inspect the coded evidence, current prerequisites, schedule observations, and synthetic storage-rehearsal record. Rejection is always permitted; verification is permitted only while every current prerequisite still passes.

## Activation and rollback

Acceptance records evidence; it does not deploy code, edit environment variables, invoke a scanner, delete an object, or bypass a legal hold. Runtime activation remains a separately authorized configuration change. If maintenance, scanner, R2, legal-hold, or retention signals regress, disable the affected production flags, preserve the audit trail, and open an incident before resuming.

