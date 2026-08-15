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

Only documents that are patient-owned, `ready`, `clean`, and `active` may be shared. Share revocation uses optimistic versioning.

## Activation gates

Activation requires an approved R2 binding, a malware-scanning provider, private object access, presigned-delivery design, upload size and page enforcement, content-type verification, quarantine operations, retention and deletion automation, incident procedures, access logging, and end-to-end security testing. Changing the feature flag alone is insufficient.

## Consequences

The interface can truthfully demonstrate document ownership and access-control design without pretending that files are stored. Expand-only upload-session, processing-event, access-grant, and deletion-job records now define idempotency, replay protection, optimistic concurrency, short-lived access, recovery, and legal-hold boundaries. The patient API has a dormant upload-intent and cancellation contract, but the compiled capability gate, missing R2 binding, and missing scanner configuration prevent session creation in production. Object keys are never returned by the public session shape. A later storage-and-scanner package can use these records without weakening the current boundary.
