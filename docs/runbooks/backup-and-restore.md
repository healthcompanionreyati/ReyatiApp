# D1 backup and restore runbook

Status: Procedure drafted; hosted rehearsal remains a pilot blocker.

## Required controls

- Backups must be encrypted, access-controlled, environment-labelled, and covered by the approved retention schedule.
- Production and investor-demo databases must remain separate.
- Restore into a new isolated database first; never overwrite the active database during rehearsal.
- Record migration version, export checksum, operator, timestamps, validation, and disposal outcome.

## Rehearsal

1. Export the selected hosted D1 database through the approved Cloudflare/Sites path.
2. Create an isolated rehearsal database and apply every migration in order.
3. Import the encrypted backup into the isolated database.
4. Run table and trigger counts, foreign-key checks, privileged workflows, negative authorization tests, and representative record reconciliation.
5. Capture recovery time and recovery point results, then dispose of the rehearsal copy under the approved process.

No production restore proceeds without an incident commander, database owner, verified target identifier, rollback plan, and two-person approval.
