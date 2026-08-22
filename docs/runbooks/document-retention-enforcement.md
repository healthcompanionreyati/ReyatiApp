# Medical-document retention enforcement

Status: Production implementation deployed behind disabled gates. No retention deletion is active.

## Execution boundary

- Endpoint: `/api/internal/document-retention-enforcement`
- Schedule: hourly at minute 7 UTC through `qivaya-document-maintenance`
- Authentication: HMAC-SHA256 with unique run ID and five-minute clock-skew limit
- Request: bounded JSON `{ "limit": 1..25 }`
- Required application gates: `QIVAYA_RETENTION_AUTOMATION_EXECUTION=true` and `QIVAYA_DOCUMENT_DELETION_PROCESSOR=true`
- Shared secret: `DOCUMENT_RETENTION_SIGNING_SECRET` in Vercel Production and the Cloudflare Worker

The executor requires one approved `medical_documents` lifecycle policy and one independently approved automation plan. Its effective batch limit is the smallest of the signed request, approved plan, and system maximum.

## Safety controls

- Only `ready`, `quarantined`, or `rejected` documents with an elapsed `deletionEligibleAt` date are considered.
- Active shares and unexpired single-use access grants exclude a document before job creation.
- Active or release-pending holds are enforced for record, account, organization, and record-class scopes.
- The deletion processor checks holds and active access again immediately before deletion and checks the hold register again after obtaining its lease.
- Private active and quarantine objects are both deleted and absence-verified before metadata becomes `permanently_deleted`.
- Jobs use optimistic leases and at most five storage attempts. Failures never mark metadata deleted.
- Daily, weekly, and monthly executions use durable cadence keys. Duplicate scheduled calls are ignored, while failed or abandoned ten-minute execution leases can be reclaimed safely.
- Outputs and Worker logs contain aggregate counts only.

## Activation checklist

1. Confirm the intended production D1 database and R2 bucket.
2. Confirm an independently approved medical-document lifecycle policy and automation plan exist with an accountable owner.
3. Confirm there are no unexplained eligible documents in a preview run.
4. Confirm legal-hold placement and independent release across all four scopes using synthetic records.
5. Configure the shared HMAC secret in Vercel Production and Cloudflare.
6. Deploy with both gates false and confirm unsigned/disabled requests return `404`.
7. Enable both gates in a monitored change window.
8. Run a signed batch with limit 1 against an approved synthetic eligible record, then verify R2 absence, job completion, metadata state, and audit evidence.
9. Increase to the approved batch limit only after the rehearsal passes.

## Emergency rollback

Set both execution gates to `false` and redeploy. In-flight requests may finish, but future Worker invocations return `404`. Preserve deletion jobs, audit records, holds, and Worker secrets for investigation. Never manually remove job or hold evidence during an incident.
