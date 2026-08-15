# ADR-003: Medical document foundation

- Status: Accepted lifecycle foundation; file handling inactive
- Date: 2026-08-14

## Decision

Reyati will establish patient-owned medical-document metadata and consent controls before accepting any file. Upload and document-byte delivery remain hard-disabled until protected object storage, malware scanning, quarantine, retention, deletion, and security controls are independently approved and configured.

The foundation permits a patient to view their own document metadata and to grant a verified, appointment-linked provider purpose-specific access for 1–30 days. The patient can revoke that grant at any time. Expired grants and their linked consent records are marked expired. Every workspace view, upload request, grant, revocation, and provider metadata view is auditable.

Provider workspaces expose only metadata for active grants. They never receive object keys, checksums, quarantine details, or document bytes in this phase.

## State model

- Upload session: `created` → `uploading` → `uploaded`, or `cancelled` / `expired` / `failed`.
- Document processing: `upload_pending` → `scanning` → `ready`, or `quarantined` / `rejected`.
- Malware scan: `pending` → `clean`, `infected`, or `failed`.
- Retention: `active` → `deletion_pending` → `permanently_deleted`.
- Deletion job: `pending` → `processing` → `completed`, with bounded `retrying`, `failed`, and legal-hold `blocked` states.
- Share: `active` → `revoked` or `expired`.
- Content access grant: `active` → `consumed` or `expired`; tokens are single-use and valid for 60 seconds.

Only documents that are patient-owned, `ready`, `clean`, and `active` may be shared. Share revocation uses optimistic versioning.

## Activation gates

The Sites project declares a private `DOCUMENTS` R2 binding and uses a server-only adapter for bounded staging, inspection, quarantine, read, and verified deletion. It exposes no public object URL or object key. A vendor-neutral scanner callback boundary verifies a raw-body HMAC, rejects stale timestamps, deduplicates provider events, and quarantines every infected, failed, missing, or mismatched object. A signed deletion-job boundary enforces approved eligibility timestamps, legal holds, inactive access, bounded leases, optimistic versions, retry limits, absence verification, and recovery. A private delivery boundary issues hashed 60-second single-use grants, binds them to the authenticated requester, revalidates patient ownership or active provider share and consent, verifies size, media type, and SHA-256 immediately before delivery, quarantines mismatches, and audits issuance, denial, blocking, and delivery without recording tokens or object keys. Every external capability remains hidden behind a compiled false gate. Activation still requires approved retention and legal-hold operations, scanner selection and secrets, delivery threat modelling, recovery exercises, incident procedures, and end-to-end security testing. Changing a feature flag or provisioning R2 alone is insufficient.

## Consequences

The interface can truthfully demonstrate document ownership and access-control design without claiming that uploads are active. Expand-only upload-session, processing-event, access-grant, and deletion-job records define idempotency, replay protection, optimistic concurrency, short-lived access, recovery, and legal-hold boundaries. The patient API has a dormant upload-intent and cancellation contract; private R2 is provisioned, but compiled capability gates, missing scanner configuration, and unapproved retention policy prevent file acceptance and deletion processing in production. Object keys are never returned by the public session shape.
