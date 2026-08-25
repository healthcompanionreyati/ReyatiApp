# Governance launch accelerator

This suite turns the document-governance prerequisites into one ordered operating path while retaining the existing maker-checker controls. It contains four protected workspaces:

1. **Ownership setup** creates only missing draft assignments for the five launch controls. A platform administrator must choose two distinct active operators and confirm that no rehearsal or verification is being claimed.
2. **Lifecycle submission** submits explicitly selected eligible policy or retention drafts. The retention plan remains blocked until the medical-document policy dependency is approved.
3. **Independent review** presents pending items to an eligible platform administrator or security auditor. The accountable owner cannot review their own item, and every decision requires an evidence note.
4. **Governance handoff** is a read-only live evidence map. It points to the first incomplete stage and performs no approval, verification, activation, deployment, patient-data read, R2 operation, or external call.

## Operating procedure

- Open `/admin/governance-handoff` and follow the first incomplete stage.
- Prepare missing ownership drafts at `/admin/ownership-setup`, then complete rehearsal evidence and verification in the existing ownership workspace.
- Prepare lifecycle drafts with the document governance setup pack and submit eligible items at `/admin/lifecycle-submission`.
- Use a different eligible operator at `/admin/lifecycle-review` to approve or reject each pending item.
- Return to the handoff board after every operating session. Continue to the retention safety rehearsal only after all policy and plan approvals are complete.

## Fail-closed boundaries

- A batch action never grants approval or verifies evidence.
- Existing ownership and lifecycle records are never overwritten by setup actions.
- Self-review and dependency-order bypasses are rejected server-side.
- All routes require an active authenticated account, enforce platform-role authorization through the underlying services, return private no-store responses, and rate-limit writes.
- Runtime document controls remain disabled until the separate activation, assurance, acceptance, and release gates pass.

## Recovery

On a conflict response, refresh the workspace and resume from the current live state. On a rejected item, amend it in its dedicated governance workspace and resubmit it. Never bypass the independent reviewer by changing the accountable owner solely to approve an item.
