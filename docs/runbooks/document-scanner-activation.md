# Medical-document scanner activation

Status: Integration implemented; production activation blocked and all upload/scanner gates remain disabled.

## Approved architecture

- Provider adapter: OPSWAT MetaDefender Cloud.
- Dispatch: authenticated server-to-server `POST /v4/file` to an explicit official regional endpoint.
- Privacy headers: `samplesharing: 0` and `privateprocessing: 1` are mandatory.
- Filename: a Qivaya document UUID plus validated extension; patient names and original filenames are never sent.
- Results: Qivaya polls with the API key. Direct vendor callbacks are not trusted.
- Persistence: only the provider job reference, lifecycle state, attempt count, bounded reason code, and timestamps are stored.
- Verdict processing: only aggregate verdict, SHA-256, and page count are accepted. Engine-level reports are neither stored nor logged.
- Failure policy: authorization failures, malformed responses, exhausted retries, checksum mismatch, invalid page count, infection, and missing objects all fail closed to private quarantine.

## Environment configuration

Secrets must be set in Vercel Production only and must never enter Git or Wrangler configuration:

- `DOCUMENT_SCAN_API_KEY`
- `DOCUMENT_SCAN_POLL_SIGNING_SECRET` (at least 32 random bytes; the identical value is a Cloudflare Worker secret)

Non-secret Vercel Production configuration:

- `DOCUMENT_SCAN_PROVIDER=opswat_metadefender_cloud`
- `DOCUMENT_SCAN_BASE_URL=https://api-prod-eucentral1.metadefender.com` (or another endpoint explicitly added to the source allowlist after review)
- `DOCUMENT_SCAN_PRIVATE_PROCESSING=true`

Independent production gates, all initially `false`:

- `QIVAYA_DOCUMENT_SCAN_DISPATCH`
- `QIVAYA_DOCUMENT_SCAN_POLLING`
- `QIVAYA_MEDICAL_DOCUMENT_UPLOADS`

The legacy `QIVAYA_DOCUMENT_SCAN_CALLBACKS` gate remains off because this integration does not trust an unsigned vendor callback.

## Required activation evidence

1. Execute a commercial agreement that permits private processing of sensitive medical documents and obtain a production API key. Do not use a free/community key.
2. Confirm the selected OPSWAT processing region and retention/deletion terms.
3. Verify a trustworthy page-count field for PDFs. Until this is proven, a clean PDF without a valid 1–25 page count is quarantined.
4. Apply the expand-only `document_scan_jobs` migration to the intended D1 production database.
5. Configure the Vercel values and both copies of the polling HMAC secret.
6. Deploy with all three activation gates still false. Confirm the unsigned poll endpoint is hidden.
7. Enable polling only and verify a signed zero-work invocation plus Worker logs.
8. Run synthetic clean, infected, malformed, timeout, checksum-mismatch, duplicate, and recovery-race exercises. Confirm no sensitive payloads appear in logs or audit metadata.
9. Obtain production security approval.
10. Enable dispatch and uploads together during a monitored change window.

## Emergency rollback

Set `QIVAYA_MEDICAL_DOCUMENT_UPLOADS=false` and `QIVAYA_DOCUMENT_SCAN_DISPATCH=false`, then redeploy. Leave polling on long enough to finish or safely quarantine already-submitted jobs. If the provider or result integrity is in doubt, disable polling too and allow signed scan recovery to quarantine records after the timeout. Do not delete job records, secrets, or quarantined bytes during the incident.
