# ADR-003: Medical document foundation

- Status: Accepted lifecycle foundation; file handling inactive
- Date: 2026-08-14

## Decision

Reyati will establish patient-owned medical-document metadata and consent controls before accepting any file. Upload and document-byte delivery remain hard-disabled until protected object storage, malware scanning, quarantine, retention, deletion, and security controls are independently approved and configured.

The foundation permits a patient to view their own document metadata and to grant a verified, appointment-linked provider purpose-specific access for 1–30 days. The patient can revoke that grant at any time. Expired grants and their linked consent records are marked expired. Every workspace view, upload request, grant, revocation, and provider metadata view is auditable.

Provider workspaces expose only metadata for active grants. They never receive object keys, checksums, quarantine details, or document bytes in this phase.

## State model

- Upload session: `created` → `uploading` → `uploaded`, or `cancelled` / `expired` / `failed`; an unreferenced failed upload can become terminally `cleaned` after verified object removal.
- Document processing: `upload_pending` → `scanning` → `ready`, or `quarantined` / `rejected`.
- Malware scan: `pending` → `clean`, `infected`, or `failed`.
- Retention: `active` → `deletion_pending` → `permanently_deleted`.
- Deletion job: `pending` → `processing` → `completed`, with bounded `retrying`, `failed`, and legal-hold `blocked` states.
- Share: `active` → `revoked` or `expired`.
- Content access grant: `active` → `consumed` or `expired`; tokens are single-use and valid for 60 seconds.

Only documents that are patient-owned, `ready`, `clean`, and `active` may be shared. Share revocation uses optimistic versioning.

## Activation gates

The Sites project declares a private `DOCUMENTS` R2 binding and uses a server-only adapter for bounded staging, inspection, quarantine, read, and verified deletion. It exposes no public object URL or object key. An authenticated upload-completion boundary incrementally enforces 10 MB, validates declared media signatures, claims an owner-bound versioned session before storage, computes SHA-256 server-side, and writes an idempotent `scan_requested` event; failures remove staged bytes and terminally fail the claimed session. A vendor-neutral scanner callback verifies a raw-body HMAC, rejects stale or unknown fields, deduplicates events, requires the same checksum, and accepts only 1–25-page PDFs or one-page images before marking content ready. Separate deletion and private-delivery boundaries enforce legal holds, access state, bounded retries, short-lived single-use grants, full integrity checks, quarantine, and privacy-safe audit records. A gated cleanup boundary accepts only fresh HMAC-signed, bounded runs after a grace period. It checks every candidate object key against document records before deletion: referenced objects are reconciled to their durable document instead of deleted, while unreferenced objects must pass verified storage deletion before their session becomes `expired` or `cleaned`. Cleanup audit metadata and operational backlog signals contain only bounded counts, status codes, and a run hash. Every external capability remains hidden behind compiled false gates. Activation still requires approved retention and legal-hold operations, scanner selection and secrets, provider dispatch integration, cleanup scheduling and alert thresholds, delivery threat modelling, recovery exercises, incident procedures, and end-to-end security testing. Changing a feature flag or provisioning R2 alone is insufficient.

## Consequences

The interface can truthfully demonstrate document ownership and access-control design without claiming that uploads are active. Expand-only upload-session, processing-event, access-grant, and deletion-job records define idempotency, replay protection, optimistic concurrency, short-lived access, recovery, cleanup, and legal-hold boundaries. The patient API has a dormant upload-intent and cancellation contract; private R2 is provisioned, but compiled capability gates, missing scanner configuration, unscheduled cleanup, and unapproved retention policy prevent file acceptance and automated processing in production. Object keys are never returned by the public session shape.
