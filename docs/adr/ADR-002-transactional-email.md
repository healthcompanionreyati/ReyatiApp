# ADR-002: Transactional email delivery

- Status: Adapter implemented; delivery disabled
- Provider: Resend proposed by the product owner
- Last reviewed: 2026-08-14
- Owner: TBD — Communications and Security

## Decision

Use a vendor-neutral D1 outbox with versioned, privacy-minimized templates and a Resend HTTP adapter. The adapter uses a per-message idempotency key and stores only provider event identifiers and operational error codes. Raw provider error bodies are not logged or persisted.

No application route or Worker schedule invokes delivery in this milestone. The compiled `outboundEmailDelivery` gate remains `false`, and hosted Resend variables are not configured by Codex.

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
