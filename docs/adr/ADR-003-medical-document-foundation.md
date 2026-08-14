# ADR-003: Medical document foundation

- Status: Accepted foundation; file handling inactive
- Date: 2026-08-14

## Decision

Reyati will establish patient-owned medical-document metadata and consent controls before accepting any file. Upload and document-byte delivery remain hard-disabled until protected object storage, malware scanning, quarantine, retention, deletion, and security controls are independently approved and configured.

The foundation permits a patient to view their own document metadata and to grant a verified, appointment-linked provider purpose-specific access for 1–30 days. The patient can revoke that grant at any time. Expired grants and their linked consent records are marked expired. Every workspace view, upload request, grant, revocation, and provider metadata view is auditable.

Provider workspaces expose only metadata for active grants. They never receive object keys, checksums, quarantine details, or document bytes in this phase.

## State model

- Document processing: `upload_pending` → `scanning` → `ready`, or `quarantined` / `rejected`.
- Malware scan: `pending` → `clean`, `infected`, or `failed`.
- Retention: `active` → `deletion_pending` → `permanently_deleted`.
- Share: `active` → `revoked` or `expired`.

Only documents that are patient-owned, `ready`, `clean`, and `active` may be shared. Share revocation uses optimistic versioning.

## Activation gates

Activation requires an approved R2 binding, a malware-scanning provider, private object access, presigned-delivery design, upload size and page enforcement, content-type verification, quarantine operations, retention and deletion automation, incident procedures, access logging, and end-to-end security testing. Changing the feature flag alone is insufficient.

## Consequences

The interface can truthfully demonstrate document ownership and access-control design without pretending that files are stored. This adds schema and consent behavior now while avoiding an unsafe temporary upload path. A later expand-and-migrate change can add upload intents and storage events without weakening the current boundary.
