# Medical document production activation

## Purpose

This runbook governs the manual transition of Qivaya's medical-document controls from their fail-closed production posture to the approved target posture. The application records authorization and observes server configuration; it never edits Vercel variables, deploys code, calls the scanner, writes or deletes R2 objects, or changes a patient record.

## Required sequence

1. Approve all five lifecycle policies and the medical-document retention plan.
2. Complete the current 22-scenario synthetic-only safety rehearsal with zero document changes, deletion jobs, deleted objects, and external calls.
3. Resolve overdue legal-hold reviews and verify protected R2 plus private scanner configuration.
4. Maintain verified `data_lifecycle` ownership with a separate backup and a rehearsal within 90 days.
5. In `/admin/document-activation`, prepare a 30-minute to 4-hour production window starting within 30 days. Use a coded, non-secret evidence reference and name distinct change, monitoring, and rollback owners.
6. A different platform administrator or security auditor independently reviews the window.
7. During the approved window, a platform administrator opens the control ledger. The authorized operator performs the separately approved Vercel and Cloudflare changes outside Qivaya.
8. Capture the server-observed posture. Incomplete or expired posture moves the window to `rollback_required`.
9. A person who neither prepared nor opened the window independently verifies the complete posture.
10. Submit and independently verify Production Lifecycle Acceptance. Activation evidence alone does not clear the launch gate.

## Target posture

- Production environment detected.
- Protected R2 configured.
- Private scanner configured.
- Upload cleanup and scan recovery enabled.
- Scan dispatch and polling enabled.
- Retention execution and deletion processor enabled.

No secret, endpoint, patient identifier, document metadata, scanner payload, or object key belongs in the activation ledger.

## Rollback containment

Request rollback immediately for an unexpected scan result, queue growth, worker failure, legal-hold discrepancy, deletion anomaly, expired window, or incomplete target posture. The operator manually disables scan dispatch, scan polling, retention execution, and the deletion processor. Upload cleanup and scan recovery may remain enabled. A different operator then uses **Verify rollback containment**; verification fails closed while any hazardous control remains enabled.

After containment, open an incident, preserve coded evidence, and do not prepare another window until the incident and its corrective actions are independently reviewed.
