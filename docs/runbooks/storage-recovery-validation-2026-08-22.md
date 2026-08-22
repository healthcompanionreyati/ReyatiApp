# Storage recovery validation — 22 August 2026

## Scope

This exercise validated the production Cloudflare resource boundary without exporting customer records or overwriting production state. The D1 exercise was schema-only and restored into isolated local state. The R2 exercise used one synthetic text object that was deleted after verification.

## Results

| Control | Result | Evidence |
| --- | --- | --- |
| D1 production resource | Pass | `reyati-production`, EEUR, 368 tables, 6,189,056 bytes |
| D1 migrations | Pass | No pending remote migrations |
| D1 Time Travel | Pass | Current bookmark retrieved successfully; bookmark value intentionally excluded from source control |
| Schema-only export | Pass | 323,737 bytes, 368 `CREATE TABLE` statements, zero `INSERT INTO` statements |
| Schema checksum | Pass | SHA-256 `7EE8A8C090171E0D0077999D4529605D1C6094A8079A1620B88F478F2048A621` |
| Isolated schema restore | Pass | 1,029 statements executed; 368 application tables restored |
| Foreign-key integrity | Pass | `PRAGMA foreign_key_check` returned no violations |
| R2 upload/download | Pass | Source and downloaded SHA-256 both `CF06770999DD7D6F53D16E2901643B8E164DF2FE83831F0BAEDE9FCD179EEF22` |
| R2 cleanup | Pass | Synthetic object deleted; bucket returned to zero objects |

## Safety boundaries

- No production database records were exported.
- No D1 restore command was run against the hosted production database.
- No patient, provider, financial, or authentication data was placed in R2.
- Local recovery artifacts are stored under the git-ignored `work/` directory.
- The current Time Travel bookmark and temporary signed export URL were not committed.

## Remaining gate

This is recovery-readiness evidence, not a full hosted data-restoration rehearsal. Before a controlled pilot, run an independently reviewed rehearsal against an isolated hosted database using an approved encrypted synthetic dataset, record measured RTO/RPO, exercise critical authorization workflows, and dispose of the rehearsal environment under the approved process.
