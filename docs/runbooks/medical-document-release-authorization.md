# Medical-document production release authorization

## Purpose

Use `/admin/document-release` only after production document activation, post-activation stability assurance, and production lifecycle acceptance have each been independently verified. This workspace creates an auditable, time-bounded release certificate; it does not deploy code or turn on production controls.

## Required sequence

1. Confirm the latest lifecycle acceptance is complete, independently verified, and no more than 30 days old.
2. Confirm it still resolves to the latest verified activation and the latest independently stabilized assurance run.
3. Resolve every aggregate document exception and close every active document incident.
4. Maintain verified primary/backup ownership and rehearsal evidence for data lifecycle and incident response.
5. Name three different active privileged operators: release owner, monitoring owner, and stop authority.
6. Prepare a window beginning within 30 days and lasting 30–480 minutes, using coded release and rollback references only.
7. Have a person other than the preparer and release owner independently authorize or reject the package.
8. Treat the certificate as effective only during its approved window. The named stop authority can revoke it immediately with a redacted reason.

## Fourteen fail-closed checks

The certificate records current lifecycle acceptance, all lifecycle prerequisites, activation recency, matching stability assurance, production environment, protected R2 posture, private scanner posture, runtime controls, aggregate exception signals, active incidents, two ownership controls, three-person separation, and the non-operative boundary. Authorization re-runs these checks and rejects stale or mismatched evidence.

## Safety boundary

The workflow reads configuration posture, aggregate counters, and coded governance records only. It reads no patient record or R2 object, calls no scanner, changes no document, executes no retention or deletion, sends no external message, changes no Vercel setting or feature flag, and does not launch production traffic. Vercel, Cloudflare, scanner, and traffic changes remain separate manual procedures.

## Stop and recovery

If any check fails before review, do not authorize. If an incident or anomaly appears during an authorized window, the named stop authority revokes the certificate and opens document incident command. An expired or revoked certificate is never treated as active; prepare a new package from current evidence after recovery.
