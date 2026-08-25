# Medical-document production operations assurance

## Purpose

This ten-module suite converts the authorized release window into a continuous, read-only operating picture. Every module is backed by current server-side release, lifecycle, runtime, and incident evidence and links operators to the dedicated controlled workspace for action.

## Modules

1. `/admin/document-runtime-controls` — production boundary, six runtime controls, and certificate coverage.
2. `/admin/document-storage-watch` — protected R2 posture, quarantine pressure, and fresh synthetic storage rehearsal.
3. `/admin/document-scanner-watch` — private scanner, dispatch, polling, stale jobs, and failed jobs.
4. `/admin/document-queue-watch` — stale scans, failed scans, and quarantine queue health.
5. `/admin/document-retention-watch` — approved plan, retention control, and failed execution signal.
6. `/admin/document-deletion-watch` — deletion processor, failed jobs, and legal-hold conflicts.
7. `/admin/document-legal-hold-watch` — overdue reviews, deletion conflicts, and the zero-change boundary.
8. `/admin/document-incident-watch` — active incidents, combined exceptions, and named stop-control handoff.
9. `/admin/document-evidence-renewal` — age of acceptance, activation, and matching assurance evidence.
10. `/admin/document-operations-handoff` — release checks, three-person coverage, bounded certificates, and the combined attention total.

## Hard boundaries

All modules are read-only and aggregate-only. They read no patient record or R2 object, call no scanner, change no runtime control, execute no retention or deletion, change no legal hold or incident, and send no external message. A module points to the existing controlled workspace whenever an operator action is required.

## Operating sequence

- Enter from `/admin/document-release-monitoring` after a certificate is authorized or scheduled.
- Review modules 01–09 in order and resolve any attention state through its linked control workspace.
- Finish at module 10 and hand the single current operating picture to the next named shift.
- Use `/admin/document-release-stop` immediately when the named stop authority must revoke the certificate.
- Use `/admin/document-incidents` for declaration, containment, recovery, and independent closure.

## Failure handling

- Every endpoint requires an active authenticated account with platform operations access.
- Responses are private and `no-store`.
- Missing or unavailable evidence is displayed as attention and never inferred as ready.
- A module performs no write and exposes no POST endpoint.
- Production authorization remains governed by the durable release certificate, not by a dashboard state.
