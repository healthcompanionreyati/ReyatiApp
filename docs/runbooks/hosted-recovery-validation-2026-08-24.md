# Hosted D1 recovery validation — 24 August 2026

## Outcome

The isolated hosted D1 recovery rehearsal passed. No production data was exported, queried, restored, modified, or deleted. The rehearsal used a generated synthetic-only package, a uniquely named temporary database, and an explicit production database name and UUID denylist.

## Recovery target and disposal

- Temporary database: `qivaya-recovery-rehearsal-20260824052300-d12fa734`
- Temporary database UUID: `fc6a7409-1ae6-4b68-815c-c3c0cafa0af2`
- Protected production database: `reyati-production`
- Protected production UUID: `e07e50a2-6b11-4ff9-bc7d-617fb80f3f6c`
- Created only for this rehearsal and deleted after validation.
- Before deletion, Wrangler metadata was fetched again and both the temporary name and UUID had to match the recorded target.
- After deletion, `wrangler d1 info` returned `Couldn't find DB with name`, confirming disposal.

## Recovery package

- Data classification: synthetic only.
- SHA-256: `5D228DB32597AE072042C9CBFA58FD48806FF7DB5759929A350ADEE2193013A0`
- Safety scan rejected Gmail addresses, `@qivaya.com` addresses, the production database name, the production UUID, and migration-ledger inserts.
- The package was restored successfully into a fresh local D1 instance before any cloud database was created.
- All 108 versioned repository migrations were applied to the hosted target before the synthetic data import.

## Validation results

| Control | Expected | Observed |
| --- | ---: | ---: |
| Organizations | 1 | 1 |
| Providers | 5 | 5 |
| Patients | 50 | 50 |
| Appointments | 40 | 40 |
| Users | 54 | 54 |
| Payment ledger entries | 40 | 40 |
| Non-synthetic auth identifiers | 0 | 0 |
| Non-synthetic email addresses | 0 | 0 |
| Unexpected payment states | 0 | 0 |
| Foreign-key violations | 0 | 0 |

- Recovery time: 50.201 seconds from hosted migration start through validation.
- Fixture recovery-point loss: 0 records.
- Validation completed at `2026-08-24T05:23:45.2843102Z`.
- Disposal completed at `2026-08-24T05:23:49.9737979Z`.

## Engineering findings

The rehearsal detected that a raw Wrangler local full export is not a dependable blank-hosted-database restore artifact because schema and data can be emitted in an order that references tables before creation. A data-only export also emits child tables before their parents and is rejected by hosted D1 foreign-key enforcement. The repeatable recovery path therefore applies the authoritative migration set first and imports a dependency-ordered, synthetic recovery package second. This path passed both local preflight and hosted validation.

## Remaining controlled-pilot evidence

Database restoration is verified. Full-platform recovery acceptance still requires privileged and negative-authorization workflows to be run against an approved protected recovery deployment and independently reviewed by a second authorized operator. That evidence must not be inferred from this database-only rehearsal.
