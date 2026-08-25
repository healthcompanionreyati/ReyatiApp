# Qivaya

Qivaya is a bilingual connected-health application for patients, providers, partner organizations, and platform operations. The production application runs at [www.qivaya.com](https://www.qivaya.com).

The persistent implementation queue, status definitions, blockers, and batch history live in [docs/PROJECT_TASK_TRACKER.md](docs/PROJECT_TASK_TRACKER.md). Update that tracker in the same commit as every implementation batch.

## Production architecture

| Concern | Current implementation |
| --- | --- |
| Application | Next.js App Router with TypeScript |
| Hosting and delivery | Vercel, deployed from GitHub `main` |
| Authentication | Clerk with server-side identity resolution |
| Authorization | Account, organization, provider, and platform-role enforcement |
| Relational data | Cloudflare D1 through Drizzle |
| Protected documents | Cloudflare R2 adapter with guarded lifecycle controls |
| Transactional email | Resend foundation and webhook processing |
| Payments | Stripe integration foundation; live money movement remains acceptance-gated |
| Observability | Health endpoint, privacy-safe operational events, Vercel Analytics and Speed Insights |
| Languages and themes | English/Arabic, LTR/RTL, light/dark, accessibility preferences |

## Safety boundaries

- Authentication never grants provider, organization, or administrator permissions by itself.
- Patient, provider, partner, and platform APIs enforce scope server-side.
- External clinical automation, OCR interpretation, live video, SMS/WhatsApp, scanner activation, and unrestricted payment movement remain blocked until their owners and acceptance evidence exist.
- Synthetic data is clearly separated from real-patient activation.
- Migrations are expand-only; destructive lifecycle actions require explicit governed workflows.

## Local development

Prerequisite: Node.js `>=22.13.0`.

```bash
npm ci
npm run dev:vercel
```

Create local secrets only in ignored environment files. Never commit Clerk, D1, R2, Resend, Stripe, or synthetic-session credentials.

## Quality and release commands

```bash
npm run typecheck
npm run lint
npm test
npm run build:vercel
npm run verify:production
npm run verify:authenticated
```

- `verify:production` checks health, release identity, branding, security headers, not-found leakage, and six public/protected journeys.
- `verify:authenticated` is a read-only patient/provider/admin check using short-lived synthetic sessions. See [the authenticated journey runbook](docs/runbooks/authenticated-journey-verification.md).
- Privileged workflow tests are limited to localhost and synthetic identities.

## Operational documentation

- [Authentication architecture](docs/adr/ADR-001-authentication-architecture.md)
- [Transactional email](docs/adr/ADR-002-transactional-email.md)
- [Data classification and retention](docs/data-classification-and-retention.md)
- [Production pilot baseline](docs/runbooks/production-pilot-baseline.md)
- [Incident response](docs/runbooks/incident-response.md)
- [Backup and restore](docs/runbooks/backup-and-restore.md)
- [Pilot operations](docs/runbooks/pilot-operations.md)
- [Investor demo synchronization](docs/investor-demo-sync-policy.md)

## Repository layout

- `app/` — pages, route handlers, and shared interface components
- `lib/` — authorization, workflows, integrations, and domain services
- `db/` — Drizzle schema and domain schema modules
- `drizzle/` — ordered expand-only SQL migrations
- `tests/` — Node test suites and repository contracts
- `scripts/` — release, smoke, seed, maintenance, and verification tools
- `workers/` — isolated background dispatch and maintenance workers
- `docs/` — decisions, runbooks, capability status, and the task tracker
