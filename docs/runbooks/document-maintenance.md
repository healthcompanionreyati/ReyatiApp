# Document maintenance runbook

Status: Production cleanup and scan-recovery are active and verified. Preview remains disabled.

## Architecture

- Cloudflare Worker: `qivaya-document-maintenance`
- Schedule: scan polling every minute; cleanup and stalled-scan recovery every ten minutes, UTC
- Upload cleanup endpoint: `/api/internal/document-upload-cleanup`
- Scan recovery endpoint: `/api/internal/document-scan-recovery`
- Scan polling endpoint: `/api/internal/document-scan-poll` (disabled until scanner activation)
- Authentication: independent HMAC-SHA256 secrets, five-minute clock-skew limit, unique run identifiers, and bounded JSON bodies
- Logging: event name, status, and cron expression only; no identifiers, object keys, signatures, or response bodies

The Worker treats a `404` response as an intentionally disabled capability. One job failing does not prevent another job from running, but the scheduled invocation is marked incomplete for observability.

## Upload cleanup boundary

The cleanup processor considers only:

- expired `created` or `uploading` sessions after a five-minute grace period; and
- failed upload sessions after the same grace period.

Before deleting an object, it checks whether a document record references the object key. Referenced objects are reconciled back to an uploaded session. Unreferenced active and quarantine objects are deleted, absence is verified, and the versioned session transition is audited.

## Scan recovery boundary

The recovery processor considers only:

- documents left in `scanning` for more than thirty minutes; and
- abandoned `recovering` leases older than five minutes.

It obtains an optimistic lease, moves available bytes into the private quarantine prefix, and marks the record quarantined. It never marks a document clean or ready. Storage failures release the lease for a later retry.

## Activation

Activation requires explicit approval because upload cleanup can permanently delete unreferenced object bytes.

1. Confirm the R2 bucket, D1 database, and deployment are the intended production resources.
2. Confirm the production bucket contains no unexplained objects.
3. Confirm both signing secrets exist in the Worker and the intended Vercel environment.
4. Enable `QIVAYA_DOCUMENT_UPLOAD_CLEANUP=true` and `QIVAYA_DOCUMENT_SCAN_RECOVERY=true` in Vercel.
5. Redeploy production.
6. Trigger one signed invocation and confirm both processors report zero failures.
7. Watch the first scheduled execution in Cloudflare Worker logs.

### Production activation record — 2026-08-22

- Explicit approval was received for production document cleanup and scan-recovery activation.
- `QIVAYA_DOCUMENT_UPLOAD_CLEANUP` and `QIVAYA_DOCUMENT_SCAN_RECOVERY` were enabled in Vercel Production only. Preview remains disabled.
- Production deployment `dpl_GE2QX3ZLqKaUhCNLsWEXLhU1aaLL` reached Ready from Git commit `e871ade`.
- Unsigned requests to both maintenance routes returned `401 signature_required`, confirming that the authorization boundary fails closed.
- Cloudflare Worker version `2ac31e48-a841-41c9-af39-5ea010c9439a` completed its scheduled `*/10 * * * *` invocation with outcome `ok`; both `documents.upload_cleanup.completed` and `documents.scan_recovery.completed` reported HTTP `200`.
- Logs contained only aggregate event names, statuses, and the cron expression. No document identifiers, object keys, signatures, or response bodies were emitted.

## Rollback

Set both environment gates to `false` and redeploy Vercel. The Worker will continue receiving its cron trigger but the application will return `404`, which the Worker records as a disabled skip. Do not delete the Worker or signing secrets during an incident; preserving them keeps rollback reversible.

## Separate launch gate

This maintenance service does not activate patient uploads, scanner dispatch/polling, scanner callbacks, private content delivery, or retention deletion. Those capabilities remain independently disabled until the scanner activation checklist and the relevant production security reviews are complete.
