# Document production preflight suite

The preflight suite converts the next medical-document launch blockers into four protected, dependency-ordered workspaces without expanding runtime authority.

1. **Legal-hold review desk** lists overdue and near-due active holds and records bounded periodic-review evidence. Hold creation and independent release approval remain in Legal Hold Operations.
2. **Retention safety rehearsal** runs the durable synthetic safety suite and records scenario outcomes with zero patient-record access, document mutation, deletion work, R2 deletion, or external calls.
3. **Runtime posture inspector** reads safe server-side booleans for the Vercel environment, protected storage, private scanner, and all six document lifecycle controls. It never exposes configuration values or credentials.
4. **Activation preflight** orders live governance, ownership, rehearsal, hold, incident, dependency, environment, and runtime-control evidence and points to the first incomplete stage.

## Operating sequence

- Start at `/admin/document-activation-preflight`.
- Complete the first incomplete evidence stage in its dedicated workspace.
- Use `/admin/legal-hold-review` to renew only active holds that are due within 30 days. Process release requests in `/admin/legal-holds` with an independent reviewer.
- Use `/admin/retention-safety` whenever the 30-day rehearsal evidence is absent or stale.
- Use `/admin/document-runtime-posture` after infrastructure changes to confirm the safe server-observed posture.
- When all preflight stages pass, continue to `/admin/document-activation` to prepare a bounded, independently reviewed activation window.

## Fail-closed boundaries

- No module changes Vercel, R2, scanner, cron, queue, secret, or environment configuration.
- No module automatically approves or verifies evidence.
- No legal hold can be created or released from the review desk.
- The rehearsal uses synthetic data and does not execute retention or deletion.
- The preflight board cannot prepare, approve, open, observe, verify, or roll back an activation window.

## Recovery

Refresh after a conflict and continue from the current evidence version. A failed rehearsal remains historical evidence; resolve the failing invariant and record a new run. If posture is incomplete, change infrastructure through the approved operational process, then return to the read-only inspector.
