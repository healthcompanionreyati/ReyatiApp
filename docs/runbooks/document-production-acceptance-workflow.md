# Medical-document production assurance and acceptance

## Purpose

This workflow turns a verified production activation into independently reviewed stability evidence and then a final, independently reviewed lifecycle acceptance. Four protected workspaces reuse the existing durable assurance and lifecycle-acceptance engines.

## Sequence

1. `/admin/document-assurance-collection` collects fourteen aggregate-only checks after the verified activation's 15-240 minute observation period.
2. `/admin/document-assurance-review` requires another authorized operator to stabilize or reject the snapshot. Stabilization revalidates every current check.
3. `/admin/lifecycle-acceptance-submission` joins current governance, legal-hold, runtime, activation, stability, scheduled-maintenance, and isolated synthetic storage evidence.
4. `/admin/lifecycle-acceptance-review` requires a reviewer different from the preparer and revalidates the complete live prerequisite set before verification.

## Hard boundaries

The four workspaces use aggregate evidence only. They do not read patient files, read or change R2 objects, call the scanner, change configuration or runtime controls, execute retention or deletion, or send an external message. Acceptance is a technical operating decision and does not establish legal compliance.

## Failure handling

- Every endpoint requires an active authenticated account and an authorized platform role.
- Responses are private and `no-store`; request bodies are bounded; writes are rate limited; stale versions fail closed.
- Collectors cannot review their own assurance snapshots, and acceptance preparers cannot review their own packages.
- A failed or stale check blocks stabilization and acceptance verification.
- Rejected evidence must be remediated and recollected or resubmitted through the preceding stage.

## Handoff

A verified lifecycle acceptance proceeds to `/admin/document-launch`. The original `/admin/document-assurance` and `/admin/data-lifecycle-acceptance` workspaces remain available as full audit ledgers and recovery surfaces.
