# Qivaya production synthetic pilot baseline

Status: implementation ready; production fixture is additive, idempotent, and synthetic-only.

## Purpose

The baseline makes the production interface demonstrable without introducing real patient or clinical data. It provisions one synthetic organization and facility, five published provider profiles, fifty patient profiles, forty appointments, finalized synthetic records, read-only payment-ledger entries, and account-owned notifications.

The signed-in platform administrator also receives a patient profile, provider profile, organization membership, appointments, records, and notifications so the same authenticated account can inspect patient, provider, and platform workspaces. Synthetic identities cannot authenticate.

## Safety contract

- The fixture only uses deterministic `qv-syn-*` identifiers and `.invalid` email addresses.
- Every care or credential statement is labelled synthetic.
- The SQL is additive and uses `INSERT OR IGNORE`; it never deletes or updates account-owned records.
- Payment entries remain `not_charged`; no money movement is represented.
- The fixture does not activate document upload, scanning, retention deletion, clinical automation, pilot access, or external partner integrations.
- Applying the fixture requires an existing active platform administrator and an explicitly selected production database.

## Generate and inspect

```powershell
npm run pilot:seed:generate
Get-Content work/qivaya-pilot-synthetic.sql
```

Confirm the target first:

```powershell
npx wrangler d1 info reyati-production --config wrangler.production.jsonc
npx wrangler d1 migrations list reyati-production --remote --config wrangler.production.jsonc
```

Apply only after confirming the exact target and aggregate preflight counts:

```powershell
npx wrangler d1 execute reyati-production --remote --config wrangler.production.jsonc --file work/qivaya-pilot-synthetic.sql
```

Re-running the same file is safe and returns the same fixture counts.

## Production monitoring

`qivaya-production-monitor` checks `/api/health` and `/providers` every five minutes. Logs contain only check names, HTTP statuses, durations, and an aggregate outcome. It sends no identifiers, request bodies, or clinical data. A failed check throws so Cloudflare marks the scheduled invocation unsuccessful.

This is availability evidence, not an external paging service. A separate approved alert destination and named responder rota remain required before a controlled real-patient pilot.
