# Recovery application acceptance — 24 August 2026

## Outcome

The combined recovery rehearsal passed. A uniquely named hosted D1 database received all versioned migrations and the screened synthetic recovery package, passed record-count and foreign-key validation, and was deleted after evidence collection. Separately, the compiled application ran against an isolated local D1 copy of the same package and passed all sixteen application scenarios.

No production record was exported, queried, restored, changed, or deleted. The application process had Clerk keys and Cloudflare D1 REST credentials removed before launch. It accepted only localhost traffic and an isolated persistence path under the rehearsal work directory.

## Recovery target and package

- Temporary hosted database: `qivaya-recovery-rehearsal-20260824063500-c73e8a64`
- Temporary hosted UUID: `08c14562-76a0-49b3-a85c-d92202d3267c`
- Protected production database: `reyati-production`
- Protected production UUID: `e07e50a2-6b11-4ff9-bc7d-617fb80f3f6c`
- Package SHA-256: `F70727A2D6118C73714D3DD7A157CF47D80EFC5EC79A88DC3F914332565F431B`
- Data classification: synthetic only
- Recovery time: 59.861 seconds
- Fixture recovery-point loss: 0 records

## Data and integrity results

| Control | Expected | Observed |
| --- | ---: | ---: |
| Organizations | 1 | 1 |
| Providers | 5 | 5 |
| Patients | 50 | 50 |
| Appointments | 40 | 40 |
| Users | 55 | 55 |
| Payment ledger entries | 40 | 40 |
| Non-synthetic auth identifiers | 0 | 0 |
| Non-synthetic email addresses | 0 | 0 |
| Unexpected payment states | 0 | 0 |
| Foreign-key violations | 0 | 0 |

## Application acceptance

All 16 scenarios passed:

1. Unauthenticated patient API access was rejected.
2. A synthetic patient could access their account API.
3. The patient was denied provider workspace access.
4. The patient was denied platform operations access.
5. A verified synthetic provider could access provider appointments.
6. The provider was denied platform operations access.
7. A platform administrator could read the recovery centre.
8. A security auditor could read aggregate recovery evidence.
9. The security auditor could not create a rehearsal.
10. The administrator planned a full-platform synthetic rehearsal.
11. The administrator started the rehearsal.
12. The administrator completed evidence within both recovery targets.
13. The rehearsal owner could not review their own evidence.
14. The patient could not review recovery evidence.
15. An independent security-auditor identity verified the evidence.
16. The plan, start, complete, and verify lifecycle remained durable and append-only.

The application evidence reference was `DR-20260824-108397`. It recorded zero failed scenarios, zero external systems contacted, zero Clerk sessions created, both positive role journeys and cross-role denials, and independent review.

## Disposal

Before cleanup, the script re-fetched Cloudflare metadata and required both the temporary database name and UUID to match the recorded target. It then deleted that exact database. A subsequent `wrangler d1 info` lookup returned `Couldn't find DB with name`, independently confirming disposal.

## Boundary

This rehearsal proves the repeatable migration, synthetic-package, integrity, application authorization, recovery-register, and cleanup paths. It does not authorize an in-place production restore. A real incident still requires frozen writes, a verified Time Travel bookmark, named incident commander and database owner, rollback evidence, two-person approval, and post-restore production validation before reopening writes.
