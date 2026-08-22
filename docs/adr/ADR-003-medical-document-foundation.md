# ADR-003: Medical document foundation

- Status: Accepted lifecycle and scanner integration foundation; file handling inactive
- Date: 2026-08-22

## Decision

Reyati will establish patient-owned medical-document metadata and consent controls before accepting any file. Upload and document-byte delivery remain hard-disabled until protected object storage, malware scanning, quarantine, retention, deletion, and security controls are independently approved and configured.

The foundation permits a patient to view their own document metadata and to grant a verified, appointment-linked provider purpose-specific access for 1–30 days. The patient can revoke that grant at any time. Expired grants and their linked consent records are marked expired. Every workspace view, upload request, grant, revocation, and provider metadata view is auditable.

Provider workspaces expose only metadata for active grants. They never receive object keys, checksums, quarantine details, or document bytes in this phase.

## State model

- Upload session: `created` → `uploading` → `uploaded`, or `cancelled` / `expired` / `failed`; an unreferenced failed upload can become terminally `cleaned` after verified object removal.
- Document processing: `upload_pending` → `scanning` → `ready`, or `quarantined` / `rejected`; overdue scans use a short `recovering` lease before fail-closed quarantine.
- Malware scan: `pending` → `clean`, `infected`, or `failed`.
- Retention: `active` → `deletion_pending` → `permanently_deleted`.
- Deletion job: `pending` → `processing` → `completed`, with bounded `retrying`, `failed`, and legal-hold `blocked` states.
- Share: `active` → `revoked` or `expired`.
- Content access grant: `active` → `consumed` or `expired`; tokens are single-use and valid for 60 seconds.

Only documents that are patient-owned, `ready`, `clean`, and `active` may be shared. Share revocation uses optimistic versioning.

## Activation gates

The Sites project declares a private `DOCUMENTS` R2 binding and uses a server-only adapter for bounded staging, inspection, quarantine, read, and verified deletion. It exposes no public object URL or object key. An authenticated upload-completion boundary incrementally enforces 10 MB, validates declared media signatures, claims an owner-bound versioned session, computes SHA-256 server-side, and dispatches a privacy-minimized copy to an allowlisted OPSWAT MetaDefender Cloud regional endpoint with sample sharing disabled and private processing required. It stores only the provider job reference in an expand-only scan-job ledger. The existing Cloudflare maintenance Worker invokes an HMAC-authenticated poll boundary every minute; jobs use optimistic leases, bounded exponential retries, aggregate-only result parsing, checksum verification, and the same fail-closed quarantine finalizer as the dormant vendor-neutral callback. Direct vendor callbacks are not trusted. A separate signed recovery boundary quarantines scans stalled for 30 minutes. Cleanup, recovery, and polling outputs contain only bounded counts and reason codes. All upload, dispatch, and polling gates remain disabled until commercial private-processing credentials, a verified PDF page-count source, retention/legal-hold approval, threat modelling, recovery exercises, incident procedures, and end-to-end security testing are complete. Changing a feature flag or provisioning R2 alone is insufficient.

## Consequences

The interface can truthfully demonstrate document ownership and access-control design without claiming that uploads are active. Expand-only upload-session, processing-event, scan-job, access-grant, and deletion-job records define idempotency, replay protection, optimistic concurrency, short-lived access, recovery, cleanup, and legal-hold boundaries. Private R2 and scheduled maintenance are active, but upload, scanner-dispatch, and scanner-polling gates remain off. Commercial OPSWAT credentials and PDF page-count assurance are required before activation. Object keys, checksums, vendor reports, and scanner credentials are never returned by public session shapes.
