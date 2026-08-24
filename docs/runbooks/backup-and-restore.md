# Cloudflare storage backup and restore runbook

Status: R2 byte round-trip, D1 Time Travel readiness, and schema-only isolated restore verified on 22 August 2026. The hosted D1 migration-and-synthetic-data restore and isolated post-restore application acceptance passed on 24 August 2026 with zero fixture loss, zero foreign-key violations, sixteen of sixteen application scenarios passing, independent role review, and verified disposal. A real incident restore still requires the named two-person production procedure below.

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
- The hosted synthetic rehearsal is `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/rehearse-hosted-d1-restore.ps1 -Database qivaya-recovery-rehearsal-YYYYMMDDhhmmss-xxxxxxxx -RunApplicationAcceptance`. The command rejects every target outside that exact naming pattern, hard-blocks the production name and database identifier, and runs the compiled application against a separate isolated local copy of the same recovery package with Clerk and remote D1 credentials removed.

## Rehearsal

1. Record `wrangler d1 info` and the current Time Travel bookmark.
2. Confirm hosted migrations have no pending entries.
3. Export schema only with `wrangler d1 export --remote --no-data`.
4. Confirm the export contains no `INSERT INTO` statements and record its SHA-256 checksum.
5. Restore the schema into an isolated local D1 instance and run table counts plus `PRAGMA foreign_key_check`.
6. Upload a synthetic R2 object under `recovery-smoke/`, download it, compare SHA-256 checksums, and delete the exact object.
7. For the hosted database rehearsal, generate the curated synthetic recovery package, validate it locally, create an isolated hosted database, apply versioned migrations, import the package, validate counts and foreign keys, measure recovery time and fixture loss, re-resolve the exact database identifier, and dispose of the rehearsal copy.
8. Run the application-level patient, provider, administrator, security-auditor, unauthenticated, cross-role denial, lifecycle, and independent-review workflows against the isolated restored package. Confirm no Clerk session or external-system call was made.

## Latest hosted rehearsal

- Date: 24 August 2026
- Evidence: `docs/runbooks/hosted-recovery-validation-2026-08-24.md`
- Schema: all 108 repository migrations applied to a blank hosted D1 database.
- Data: 1 organization, 5 providers, 50 patients, 40 appointments, 54 users, and 40 non-charged payment-ledger entries restored.
- Isolation: zero non-synthetic authentication identifiers, zero non-synthetic email addresses, and zero unexpected payment states.
- Integrity: zero foreign-key violations.
- Recovery time: 50.201 seconds from migration start through data and integrity validation.
- Recovery point loss: zero fixture records.
- Disposal: the exact temporary database name and UUID were re-resolved before deletion; a subsequent metadata lookup confirmed it no longer exists.

## Latest application-level acceptance

- Date: 24 August 2026
- Evidence: `docs/runbooks/recovery-application-acceptance-2026-08-24.md`
- Hosted target: `qivaya-recovery-rehearsal-20260824063500-c73e8a64` (`08c14562-76a0-49b3-a85c-d92202d3267c`).
- Recovery package: 1 organization, 5 providers, 50 patients, 40 appointments, 55 users, and 40 non-charged payment-ledger entries.
- Integrity: zero foreign-key violations, zero unexpected identities, zero unexpected email domains, and zero unexpected payment states.
- Application: 16 of 16 scenarios passed across patient, provider, platform administrator, security auditor, unauthenticated, and cross-role denial paths.
- Recovery register: plan, start, complete, and verify events persisted; owner self-review and patient review were rejected; an independent security-auditor identity verified the evidence.
- Isolation: zero external systems contacted and zero Clerk sessions created.
- Recovery time: 59.861 seconds with zero fixture-record loss.
- Disposal: the exact temporary name and UUID were verified before deletion; a subsequent metadata lookup confirmed the database no longer exists.

## Production incident restore

1. Freeze writes or place the application into the approved maintenance state.
2. Record the current bookmark before changing anything; this preserves the option to undo an incorrect restore.
3. Resolve the intended recovery timestamp to a bookmark with `wrangler d1 time-travel info`.
4. Have the incident commander and database owner verify the database identifier, bookmark, impact window, rollback bookmark, and communication plan.
5. Only after two-person approval, run the documented Time Travel restore command.
6. Validate schema, foreign keys, critical record counts, authentication, authorization, booking, provider, and admin workflows before reopening writes.
7. Record the recovery point, elapsed recovery time, validation evidence, operator identities, and follow-up actions.

No production restore proceeds without an incident commander, database owner, verified target identifier, rollback plan, and two-person approval.
