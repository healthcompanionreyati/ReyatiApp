# Production monitoring acceptance

## Purpose

This workflow proves that Qivaya's privacy-safe, first-party production monitoring is operating before the controlled-pilot readiness gate can clear. It does not enable an external telemetry export and never stores telemetry payloads, endpoints, credentials, patient identifiers, or clinical content.

## Evidence boundary

- Vercel Runtime Logs receive the structured metadata emitted by `lib/observability.ts`.
- Vercel Web Analytics and Speed Insights are registered in the root layout.
- Security alerts use Qivaya's durable in-app route.
- All three telemetry policies must be independently approved.
- Each approved policy needs a passing local redaction validation from the previous 30 days.
- The acceptance sample window must be inside the previous 30 days.
- Only a coded, non-secret evidence reference is stored.
- The preparer cannot verify their own evidence.

## Operator procedure

1. In `/admin/observability`, approve the application-error, performance, and security-event policies and run their local redaction validations.
2. In Vercel Runtime Logs, observe Qivaya structured operational events for the declared production window. Do not copy log bodies into Qivaya.
3. Run or inspect a synthetic security-alert drill and confirm durable in-app delivery.
4. In `/admin/monitoring-acceptance`, submit the sample window and a coded evidence reference.
5. A different active platform administrator or security auditor checks the evidence in the source system, then verifies or rejects the run.
6. `/admin/operations` recalculates the monitoring readiness gate from the latest verified evidence.

## Fail-closed conditions

The gate remains blocked if the app is not executing in Vercel production, any policy or fresh validation is missing, the monitoring or alert route was not observed, prohibited fields were detected, an external system was contacted during synthetic validation, the evidence is older than 30 days, or independent review is incomplete.

## Deployment record — 24 August 2026

Before migration 0108 was applied, Wrangler reported migrations 0095–0107 as pending even though their payment-control schema had previously been created. The release stopped on the first existing table. A read-only reconciliation confirmed all 73 declared tables and indexes and all four nullable columns from those migrations were already present. Only then were the 13 missing ledger entries recorded. Wrangler subsequently applied 0108 normally, and a final remote migration check reported no pending migrations. No production table, index, column, or customer record was deleted or rewritten during reconciliation.
