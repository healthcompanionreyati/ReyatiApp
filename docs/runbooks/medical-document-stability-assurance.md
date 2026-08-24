# Medical document post-activation stability assurance

## Purpose

Use `/admin/document-assurance` after a production document activation is independently verified and before final production lifecycle acceptance. The ledger captures a bounded, repeatable stability snapshot and a separate reviewer records the decision.

## Required sequence

1. Complete the controlled production activation and obtain `verified` status.
2. Allow the selected 15-240 minute observation window to elapse.
3. A platform administrator selects that activation and supplies a non-secret coded evidence reference.
4. The server collects all fourteen checks from server configuration and aggregate D1 counters.
5. A different active platform administrator or security auditor reviews the result.
6. `stabilized` is allowed only when every stored check passed and every current aggregate check still passes.
7. A fresh independently stabilized run tied to the latest verified activation is required by production lifecycle acceptance.

## Fail-closed checks

- production environment, protected R2 configuration, and private scanner configuration;
- cleanup, scan recovery, dispatch, polling, retention execution, and deletion processing enabled;
- no stale or failed scan jobs;
- no failed deletion or retention run;
- no legal-hold conflict;
- no document remaining in quarantine;
- no active medical-document incident;
- completed observation window and independently verified activation; and
- the non-operative safety boundary.

Any failed check produces `review_required`. The reviewer must reject the evidence or wait for the responsible operational workflow to resolve the condition and collect a new snapshot. This module never performs containment or remediation.

## Privacy and operational boundary

The module reads configuration posture and aggregate counts only. It does not read a patient record, document identifier, object key, document body, or R2 object. It does not call the scanner, write or delete an R2 object, change a document record, execute retention or deletion, edit deployment configuration, store credentials, or send an external message. It records zero for customer records read, objects read or changed, scanner calls, and external messages.

## Incident handoff

If a scanner, backlog, quarantine, retention, deletion, legal-hold, integrity, or storage signal is not clear, open or continue the corresponding case in `/admin/document-incidents`. Stability assurance must remain blocked until the aggregate signal is clear and every active incident is independently closed.
