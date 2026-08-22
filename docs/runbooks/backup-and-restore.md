# Cloudflare storage backup and restore runbook

Status: R2 byte round-trip, D1 Time Travel readiness, and schema-only isolated restore verified on 22 August 2026. A full-data hosted restore rehearsal remains a controlled-pilot gate.

## Required controls

- Backups must be encrypted, access-controlled, environment-labelled, and covered by the approved retention schedule.
- Production and investor-demo databases must remain separate.
- Restore into a new isolated database first; never overwrite the active database during rehearsal.
- Record migration version, export checksum, operator, timestamps, validation, and disposal outcome.
- Never run `wrangler d1 time-travel restore` against production as a rehearsal. It overwrites the database in place.
- Do not export live records to an operator workstation. Use schema-only exports until an approved encrypted rehearsal environment and data-handling procedure exist.
- R2 smoke checks must use a generated `recovery-smoke/` key, synthetic content, checksum comparison, and guaranteed cleanup.

## Current platform recovery controls

- D1 Time Travel is automatically active for the production storage subsystem. Retrieve a current or timestamped bookmark before any risky database change.
- Production migrations must report no pending entries before release promotion.
- The private R2 bucket is reachable through authenticated Cloudflare tooling and is not exposed through a public bucket URL.
- The repeatable safe verification command is `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-cloudflare-recovery.ps1`.

## Rehearsal

1. Record `wrangler d1 info` and the current Time Travel bookmark.
2. Confirm hosted migrations have no pending entries.
3. Export schema only with `wrangler d1 export --remote --no-data`.
4. Confirm the export contains no `INSERT INTO` statements and record its SHA-256 checksum.
5. Restore the schema into an isolated local D1 instance and run table counts plus `PRAGMA foreign_key_check`.
6. Upload a synthetic R2 object under `recovery-smoke/`, download it, compare SHA-256 checksums, and delete the exact object.
7. For a full rehearsal, create an isolated hosted recovery database, import an approved encrypted synthetic backup, run privileged and negative-authorization workflows, measure RTO/RPO, independently review the evidence, and dispose of the rehearsal copy.

## Production incident restore

1. Freeze writes or place the application into the approved maintenance state.
2. Record the current bookmark before changing anything; this preserves the option to undo an incorrect restore.
3. Resolve the intended recovery timestamp to a bookmark with `wrangler d1 time-travel info`.
4. Have the incident commander and database owner verify the database identifier, bookmark, impact window, rollback bookmark, and communication plan.
5. Only after two-person approval, run the documented Time Travel restore command.
6. Validate schema, foreign keys, critical record counts, authentication, authorization, booking, provider, and admin workflows before reopening writes.
7. Record the recovery point, elapsed recovery time, validation evidence, operator identities, and follow-up actions.

No production restore proceeds without an incident commander, database owner, verified target identifier, rollback plan, and two-person approval.
