# ADR-002: Transactional email delivery

- Status: Production delivery, webhook processing, and scheduled dispatch active; Preview disabled
- Provider: Resend
- Last reviewed: 2026-08-22
- Owner: TBD — Communications and Security

## Decision

Use a vendor-neutral D1 outbox with versioned, privacy-minimized templates and a Resend HTTP adapter. The adapter uses a per-message idempotency key and stores only provider event identifiers and operational error codes. Raw provider error bodies are not logged or persisted.

Production delivery is controlled by the environment-backed `QIVAYA_OUTBOUND_EMAIL_DELIVERY` gate. A separate Cloudflare Worker invokes the authenticated internal dispatcher every five minutes; the processor remains bounded to 25 messages per run. The Worker has no public route and logs only an aggregate event name, HTTP status, and cron expression. Preview delivery remains disabled.

The account communication settings screen is live. It stores the user's English or Arabic preference and prospective email opt-in, keeps essential in-app notifications authoritative, and displays the platform-provided email as `provider_asserted`. Saving an opt-in never marks a contact verified and never bypasses the delivery gate.

Appointment lifecycle, provider-verification decisions, finalized visit records, family-access changes, and support-case events now record account-owned transactional email intents. If the user opted in but the contact is not independently verified or delivery is disabled, the intent is stored as `suppressed` with no retry time. Suppressed events are evidence of workflow coverage and are never released later as stale messages.

Email verification uses an account-owned, expiring D1 challenge and an HMAC-signed link generated only at dispatch time. No reusable verification token is stored in plaintext. Requests are rate-limited per contact and remain unavailable until both outbound delivery and a dedicated signing secret are configured.

Adult-family and caregiver invitations retain the existing manual-link fallback whenever delivery or an independently verified contact is unavailable. Eligible invitations are queued directly to the exact consent email, and their HMAC-signed acceptance link is generated only at dispatch time; the API never returns that link to the inviter.

The Resend webhook adapter verifies Svix HMAC signatures against the unmodified request body, rejects stale timestamps, deduplicates provider event IDs, and stores only a payload hash. Delivered, delayed, bounced, failed, and complaint outcomes update the outbox ledger. Bounces and complaints suppress the associated account contact. The route is controlled by the environment-backed `QIVAYA_COMMUNICATIONS_WEBHOOKS` gate and remains disabled in Preview.

The bounded outbox processor claims due messages with a 15-minute processing lease, recovers abandoned leases, caps each run at 25 records, and preserves exponential retry limits. A role-scoped communications operations workspace reports only aggregate and operational metadata. Platform administrators may request a bounded run, while the separate scheduled Worker provides normal production dispatch.

External invitation addresses that bounce or complain are stored only as SHA-256 suppression hashes. Future activated invitation delivery checks the hash before creating an email intent.

## Production activation record — 2026-08-22

- `qivaya.com` was verified by Resend with Hostinger-managed DNS; the approved sender is `Qivaya <hello@qivaya.com>`.
- The Resend webhook endpoint was corrected from the redirecting apex URL to `https://www.qivaya.com/api/webhooks/resend` while preserving its signing secret and six subscribed delivery events.
- The production outbox contained zero queued messages before activation.
- `QIVAYA_OUTBOUND_EMAIL_DELIVERY` and `QIVAYA_COMMUNICATIONS_WEBHOOKS` were enabled in Vercel Production only. Preview remains disabled.
- Vercel production deployment `dpl_HWWi6swUtQBeydRDt6LRnoUN2Da4` reached Ready and was assigned to `www.qivaya.com`.
- Unsigned production requests returned `401 unauthorized` for dispatch and `401 signature_required` for webhooks.
- A fresh synthetic test message containing no account or health information was accepted and delivered to the approved test recipient. Its signed `email.sent` and `email.delivered` events both succeeded on the first attempt with `200 OK`; `matched: false` was expected because the smoke message bypassed the application outbox.
- Cloudflare Worker version `20beba10-522e-4b15-ba51-b6539ac7c858` completed the scheduled `*/5 * * * *` dispatch with HTTP `200` and an empty outbox.

## Continuing operational requirements

- Custom domain and sending subdomain selected.
- SPF, DKIM, and DMARC configured and verified.
- Sending-only, domain-restricted API key created and stored as a Vercel Production secret.
- From and reply-to addresses approved.
- Data-processing, residency, privacy, retention, and incident requirements approved.
- English and Arabic templates reviewed for privacy, safety, accessibility, and support ownership.
- Verified recipient contact and explicit email preference flows implemented.
- Bounce, complaint, suppression, webhook authentication, retry, and rate-limit handling tested in isolation.
- Named communications and incident owners assigned.

In-app notifications remain the authoritative communication channel and fallback. Production email delivery must be disabled immediately if domain verification, signing-secret integrity, suppression processing, or scheduled-dispatch health is lost.
