# Medical document launch command centre

Use `/admin/document-launch` as the single production evidence map for the medical-document launch chain. It reads current aggregate evidence and orders remediation by dependency; it does not replace the specialist approval workspaces.

## Operating sequence

1. Verify lifecycle and incident-response ownership, including primary, backup, escalation path, coded evidence, and a rehearsal within 90 days.
2. Independently approve all five lifecycle policies.
3. Approve the medical-document retention plan and run the 22-scenario synthetic rehearsal with zero operational effects.
4. Resolve overdue legal-hold reviews.
5. Confirm Vercel production, private R2, private scanner processing, and all six runtime controls server-side.
6. Complete a bounded document activation window and independently verify it.
7. Observe and independently stabilize the matching post-activation assurance run.
8. Prepare and independently verify the production lifecycle acceptance within 30 days.
9. Keep document exception and incident signals clear, establish three distinct privileged release operators, and independently authorize the bounded release certificate.

The centre highlights only the first unresolved dependency. Later incomplete steps remain visibly blocked, while independently satisfied safety checks remain complete.

## Safety boundary

The command centre reads aggregate evidence only. It does not read patient records or R2 objects, change environment configuration, enable feature flags or runtime controls, call the scanner, execute retention or deletion, or launch production traffic. Missing, stale, mismatched, or rejected evidence fails closed.

## Production handoff

After every stage is complete, confirm that the active certificate reference and expiry are visible in the command centre. Keep the audit ledger and document incident command available throughout the bounded window. If any prerequisite becomes stale, an incident appears, or the stop authority revokes the certificate, treat the launch as unauthorized.
