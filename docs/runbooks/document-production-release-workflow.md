# Medical-document production release workflow

## Purpose

This four-stage workflow turns a verified lifecycle acceptance into a time-bounded, independently authorized release certificate and keeps the live decision visible to its named operators. It reuses the durable medical-document release engine and leaves the original `/admin/document-release` ledger available for audit and recovery.

## Sequence

1. `/admin/document-release-preparation` binds current acceptance, activation and assurance evidence to a 30–480 minute window, coded rollback evidence and three distinct active operators.
2. `/admin/document-release-review` requires a reviewer different from both the preparer and release owner. Authorization revalidates every stored and current release check.
3. `/admin/document-release-monitoring` exposes certificate timing, effective status, named operators and aggregate exception signals without mutating production.
4. `/admin/document-release-stop` permits only the named stop authority to revoke the authorized certificate with a bounded redacted reason.

## Hard boundaries

These workspaces read aggregate evidence only. They read no patient record or R2 object, call no scanner, change no Vercel or storage configuration, execute no retention or deletion, and change no production traffic. Revocation changes the governance certificate only; infrastructure containment and incident response remain separate controlled procedures.

## Failure handling

- Every endpoint requires an active authenticated account and an authorized platform role.
- Responses are private and `no-store`; bodies are bounded to 8 KiB; writes are rate limited.
- Missing, stale, mismatched or failed evidence blocks preparation and authorization.
- The preparer and release owner cannot independently authorize the package.
- Only the named stop authority can revoke an authorized certificate.
- Stale versions fail closed and require a refresh before retrying.

## Handoff

An authorized certificate proceeds to live-window monitoring. Any anomaly or incident proceeds through named stop control and then `/admin/document-incidents`. A revoked or expired certificate is never treated as active.
