# Medical document incident command and recovery

## Purpose

`/admin/document-incidents` is Qivaya's governed command ledger for scanner outages, scan backlogs, quarantine spikes, integrity mismatches, missing storage objects, retention anomalies, deletion failures, and legal-hold conflicts. It extends the main operational incident register; it does not create a separate source of truth.

The workspace accepts coded evidence references and aggregate counts only. Never enter patient identity, a document ID, an object key, medical information, credentials, endpoints, or unredacted provider output.

## Workflow

1. A platform administrator declares a coded signal, severity, aggregate impact, evidence reference, and assigned active responder. The server creates both the document command record and linked operational incident.
2. Only the assigned responder can acknowledge the incident.
3. The responder records a coded containment and coded evidence reference. `hazardous_controls_locked` is accepted only when scan dispatch, scan polling, retention execution, and deletion processing are all observed disabled server-side.
4. A platform administrator prepares recovery using coded evidence. Reconciliation, legal-hold review, and synthetic validation must all pass.
5. A different authorized operator independently returns the recovery or closes it as recovered/contained. The incident declarer and recovery preparer cannot close it.
6. Recovered closure rechecks the relevant live aggregate signal. Contained closure requires hazardous controls to remain locked.

## Boundaries

The module never reads a patient file or R2 object, calls the malware scanner, changes Vercel or Cloudflare configuration, writes credentials, changes document records, executes containment or recovery, deletes an object, or sends an external message. All state changes are governance and evidence records in D1.

## Aggregate signals

- Scan backlog: scan jobs in a non-final state for more than 30 minutes.
- Quarantine: document count only; no identifier or reason is exposed.
- Scanner/deletion failure: aggregate failed-job counts only.
- Legal-hold conflict: aggregate blocked deletion-job count only.
- Retention anomaly: aggregate failed execution-run count only.

## Fail-closed launch behavior

Any document incident in `open`, `acknowledged`, `contained`, or `recovery_review` blocks production lifecycle acceptance and document activation readiness. A database failure, stale version, missing independent reviewer, incomplete evidence, unsafe runtime posture, or uncleared live signal rejects the requested transition.

## Operational response outside Qivaya

Actual containment and recovery remain human-controlled operational actions. Authorized operators must use approved Vercel, Cloudflare, R2, and scanner procedures outside this UI, preserve non-secret evidence references, and then record only the resulting coded evidence here.
