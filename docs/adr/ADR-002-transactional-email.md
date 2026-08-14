# ADR-002: Transactional email delivery

- Status: Adapter implemented; delivery disabled
- Provider: Resend proposed by the product owner
- Last reviewed: 2026-08-14
- Owner: TBD — Communications and Security

## Decision

Use a vendor-neutral D1 outbox with versioned, privacy-minimized templates and a Resend HTTP adapter. The adapter uses a per-message idempotency key and stores only provider event identifiers and operational error codes. Raw provider error bodies are not logged or persisted.

No application route or Worker schedule invokes delivery in this milestone. The compiled `outboundEmailDelivery` gate remains `false`, and hosted Resend variables are not configured by Codex.

The account communication settings screen is live. It stores the user's English or Arabic preference and prospective email opt-in, keeps essential in-app notifications authoritative, and displays the platform-provided email as `provider_asserted`. Saving an opt-in never marks a contact verified and never bypasses the delivery gate.

Appointment lifecycle, provider-verification decisions, finalized visit records, family-access changes, and support-case events now record account-owned transactional email intents. If the user opted in but the contact is not independently verified or delivery is disabled, the intent is stored as `suppressed` with no retry time. Suppressed events are evidence of workflow coverage and are never released later as stale messages.

Email verification uses an account-owned, expiring D1 challenge and an HMAC-signed link generated only at dispatch time. No reusable verification token is stored in plaintext. Requests are rate-limited per contact and remain unavailable until both outbound delivery and a dedicated signing secret are configured.

Adult-family and caregiver invitations retain the existing manual-link fallback while delivery is disabled. When delivery is activated, the invitation is queued directly to the exact consent email and its HMAC-signed acceptance link is generated only at dispatch time; the API no longer returns that link to the inviter.

The Resend webhook adapter verifies Svix HMAC signatures against the unmodified request body, rejects stale timestamps, deduplicates provider event IDs, and stores only a payload hash. Delivered, delayed, bounced, failed, and complaint outcomes update the outbox ledger. Bounces and complaints suppress the associated account contact. The route remains hidden behind the compiled `communicationsWebhooks` gate.

## Activation requirements

- Custom domain and sending subdomain selected.
- SPF, DKIM, and DMARC configured and verified.
- Sending-only, domain-restricted API key created and stored as a Sites secret.
- From and reply-to addresses approved.
- Data-processing, residency, privacy, retention, and incident requirements approved.
- English and Arabic templates reviewed for privacy, safety, accessibility, and support ownership.
- Verified recipient contact and explicit email preference flows implemented.
- Bounce, complaint, suppression, webhook authentication, retry, and rate-limit handling tested in isolation.
- Named communications and incident owners assigned.

Until every gate passes, email remains unavailable and in-app notifications remain the authoritative communication channel.
