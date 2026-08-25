# Qivaya delivery task tracker

This file is the persistent source of truth for implementation work. Every batch must update this board in the same commit as the implementation. A task is marked done only when its acceptance evidence exists in the repository or the deployed production environment.

## Status rules

- `[x] DONE` — implemented, verified, and committed.
- `[ ] IN PROGRESS` — the single batch currently being executed.
- `[ ] NEXT` — unblocked and ordered for implementation.
- `[ ] BLOCKED` — requires a named decision, credential, vendor, real-world owner, or external approval.
- `[ ] DEFERRED` — intentionally outside the current release.
- Keep no more than one implementation batch `IN PROGRESS`.
- Do not mark an external integration done from code presence alone; production evidence is required.

## Current release baseline

| Item | Current evidence |
| --- | --- |
| Production | [www.qivaya.com](https://www.qivaya.com) |
| Git branch | `main` |
| Verified release | Current `main`; authoritative SHA is returned by `/api/health` |
| Application pages | 334 |
| API routes | 339 |
| Automated test files | 155 |
| Expand-only migrations | 114 |
| Hosting | Vercel production |
| Database | Cloudflare D1 |
| Protected object storage | Cloudflare R2 adapter and guarded document lifecycle |
| Authentication | Clerk |
| Transactional email | Resend integration and webhook foundation |
| Production health | Application, database, synthetic pilot data, and provider catalogue healthy |

## Active batch

- [ ] **IN PROGRESS — QV-UX-02: dense-route visual remediation**
  - Completed group: notification-preference governance, patient-profile governance, and provider team-access governance.
  - Completed group: health profile, facilities, complaints, accessibility settings, consents, notification preferences, privacy rights, emergency profile, account security, and health library.
  - Completed group: payment acceptance, payment go-live, payment lifecycle rehearsal, payment activation, reconciliation, disputes, receipts, finance controls, provider credentials, facility profile, organization settings, and schedule rules.
  - Completed group: document capture, record index, sharing directives, access history, data quality, patient documents, provider documents, prescription review, report review, health-wallet operations, data-quality operations, and document-operations handoff.
  - Completed group: appointments, pre-visit intake, appointment preparation, accommodations, post-visit actions, care timeline, waitlist, digital queue, virtual care, messages, referrals, and patient experience.
  - Completed group: care plans, diagnostic imaging, insurance, pharmacy, laboratory, home care, sample collection, medication reminders, immunizations, and screening history.
  - Completed group: provider care plans, diagnostic imaging, insurance, pharmacy, laboratory, encounter continuity, follow-up actions, intake review, accommodation requests, and preparation guides.
  - Completed group: ten partner onboarding/fulfilment/settlement workspaces and ten matching admin benefits, clinical-service, partner, care-plan, and appointment-journey governance workspaces.
  - Continue grouped route batches for remaining legacy tables, cards, long text, mobile widths, and dark theme.

## Completed foundation

- [x] **DONE — QV-FND-01: Qivaya rebrand and domain** — Qivaya identity and `qivaya.com` production aliases are active.
- [x] **DONE — QV-FND-02: GitHub and Vercel delivery** — `healthcompanionreyati/ReyatiApp` main deploys to Vercel; GitHub quality workflow is present.
- [x] **DONE — QV-FND-03: independent authentication** — Clerk sign-in, sign-up, protected routes, and account identity are integrated.
- [x] **DONE — QV-FND-04: durable application data** — D1 schema, authorization boundaries, audit records, rate limits, and expand-only migrations are implemented.
- [x] **DONE — QV-FND-05: synthetic production baseline** — one synthetic organization, five providers, patient data, appointments, records, and safe payment states support demonstrations.
- [x] **DONE — QV-FND-06: production health and observability foundation** — health endpoint, Vercel analytics, Speed Insights, privacy-safe operational logging, and admin operational views are active.
- [x] **DONE — QV-FND-07: capability registry** — central capability ownership, dependencies, limitations, environments, roles, safety gates, and validation dates are recorded.
- [x] **DONE — QV-FND-08: light, dark, Arabic, and RTL foundations** — persistent themes, locale, logical layout behavior, focus, and reduced-motion support are implemented.

## Completed patient modules

- [x] **DONE — QV-PAT-01: patient home and navigation**
- [x] **DONE — QV-PAT-02: provider discovery, filters, profiles, and saved care**
- [x] **DONE — QV-PAT-03: appointment booking, cancellation, waitlist, preparation, accommodation, and queue journeys**
- [x] **DONE — QV-PAT-04: health wallet, record index, visit records, health profile, measurements, immunizations, and screening history**
- [x] **DONE — QV-PAT-05: documents, capture drafts, consented sharing, access history, and lifecycle states**
- [x] **DONE — QV-PAT-06: family delegation, dependent-care foundation, consent, revocation, and transition evidence**
- [x] **DONE — QV-PAT-07: notifications, preferences, secure messages, support, complaints, privacy rights, and service status**
- [x] **DONE — QV-PAT-08: pharmacy, laboratory, imaging, referrals, home care, insurance, benefits, and care plans foundations**
- [x] **DONE — QV-PAT-09: wellness, symptoms, medication reminders, post-visit actions, reviews, and experience foundations**
- [x] **DONE — QV-PAT-10: payments and receipt ledger foundation** — read-only and test-gated; no unsupported money-movement claim.

## Completed provider and partner modules

- [x] **DONE — QV-PRO-01: provider onboarding, credentials, organization membership, verification, and publication**
- [x] **DONE — QV-PRO-02: services, fees, schedule rules, coverage, availability, leave, waitlist, and queue operations**
- [x] **DONE — QV-PRO-03: patient directory, encounters, finalization, continuity, care plans, and follow-up actions**
- [x] **DONE — QV-PRO-04: provider messaging, referrals, virtual-care foundation, documents, prescriptions, and report review**
- [x] **DONE — QV-PRO-05: provider insights, experience, team access, facility profile, and organization settings**
- [x] **DONE — QV-PRT-01: partner onboarding, service fulfilment, benefits, and settlement evidence foundations**

## Completed platform and governance modules

- [x] **DONE — QV-ADM-01: platform overview, searchable navigation, access, organizations, and provider verification**
- [x] **DONE — QV-ADM-02: audit, support cases, moderation, finance oversight, communications, incidents, recovery, and observability**
- [x] **DONE — QV-ADM-03: pilot scope, cohort, enrollment, invitations, participation, learning, review, launch, command, and rehearsal**
- [x] **DONE — QV-ADM-04: retention, legal holds, deletion, security alerts, ownership, and continuity governance**
- [x] **DONE — QV-ADM-05: payment acceptance, activation, reconciliation, disputes, assurance, incidents, and lifecycle rehearsal foundations**
- [x] **DONE — QV-ADM-06: integration, interoperability, data-quality, tenant, workforce, catalogue, and policy governance foundations**
- [x] **DONE — QV-DOC-01: guarded upload sessions, protected R2 adapter, scanner dispatch/poll/recovery, quarantine, delivery grants, retention, deletion, and cleanup**
- [x] **DONE — QV-DOC-02: document activation, release, assurance, incident, change-control, preflight, and production-operations workspaces**
- [x] **DONE — QV-UX-01: shared responsive application-shell release** — patient, provider, admin, audit, operations, organizations, documents, and profile shell contracts deployed.
- [x] **DONE — QV-QA-01: production journey verification module** — six public/protected journeys, health release identity, security headers, branded-not-found detection, bounded retries, and machine-readable evidence are enforced.
- [x] **DONE — QV-QA-03: accessibility regression expansion** — automated focus order, dialog containment and return, field-error semantics, mixed direction, reflow, readable type, and reduced-motion contracts now cover shared patient, provider, and platform surfaces.
- [x] **DONE — QV-OPS-01: release evidence automation** — a fail-closed collector retains build, migration, runtime-error scan, health, release identity, security-header, and protected-route evidence without sensitive payloads.
- [x] **DONE — QV-DOCS-01: documentation reconciliation** — README and readiness reporting now describe the current Qivaya/Vercel/Clerk/D1/R2/Resend architecture and point to this tracker.

## Next unblocked implementation queue

- [ ] **NEXT — QV-DEMO-01: validated investor-demo synchronization** — copy only a verified main release, then apply synthetic personas, guided tours, and persistent concept labels in the separate demo application.

## Blocked external activation work

- [ ] **BLOCKED — QV-QA-02: complete authenticated journey evidence** — the privacy-safe read-only patient/provider/admin verifier and runbook are implemented; production completion requires a dedicated short-lived synthetic provider session. Patient/admin passed with the current account and provider access correctly failed closed.
- [ ] **BLOCKED — QV-PILOT-01: real-patient controlled pilot** — requires named clinical, privacy, security, incident, verification, and pilot-operations owners plus agreements and approval evidence.
- [ ] **BLOCKED — QV-PAY-01: live checkout, refunds, and settlement** — requires approved commercial model, Stripe mode/credentials, finance owners, and controlled acceptance evidence.
- [ ] **BLOCKED — QV-DOC-03: production malware-scanner activation** — requires approved private-processing contract, credentials, PDF assurance, security review, and named quarantine ownership.
- [ ] **BLOCKED — QV-OPS-02: external security alert delivery** — requires transport vendor, recipients, severity thresholds, and an on-call rota.
- [ ] **BLOCKED — QV-COMMS-01: SMS or WhatsApp** — provider and consent model not selected.
- [ ] **BLOCKED — QV-CLIN-01: production OCR, report interpretation, and clinical AI actions** — requires document activation, clinical ownership, evaluation data, model approval, and human-review policy.
- [ ] **BLOCKED — QV-I18N-01: human Arabic and assistive-technology acceptance** — requires native Arabic clinical/legal reviewers and representative device testing.
- [ ] **BLOCKED — QV-EXT-01: external credential, calendar, device, and record exchange activation** — authoritative partners and contracts not selected.

## Deferred product scope

- [ ] **DEFERRED — QV-FUT-01: public self-registration and multi-organization expansion** — follows controlled-pilot evaluation.
- [ ] **DEFERRED — QV-FUT-02: live video consultation media** — licensed service and clinical protocol decisions required.
- [ ] **DEFERRED — QV-FUT-03: automated care routing or diagnosis** — outside the current Qivaya safety boundary.

## Batch completion log

| Date | Batch | Result | Release |
| --- | --- | --- | --- |
| 2026-08-25 | Core responsive layouts | Patient wallet, provider discovery/console, and audit geometry stabilized | `f9fb9a8` |
| 2026-08-25 | Admin/account UI stability | Admin, operations, organizations, account profile, dark theme, and document-family regression contracts | `420dc55` |
| 2026-08-25 | System-health title recovery | Restored the bilingual production document title after live verification | `ab1f3ad` |
| 2026-08-25 | Persistent tracker and release gate | Added the delivery source of truth, shared security headers, and six-journey fail-closed production verification | Current `main` |
| 2026-08-25 | Authenticated journey and documentation batch | Added the three-role read-only verifier, captured patient/admin evidence, verified provider fail-closed behavior, repaired wallet failure UX, and reconciled project documentation | Current `main` |
| 2026-08-25 | Accessibility, evidence, and dense-route batch | Expanded accessibility automation, added fail-closed release evidence collection, raised the shared readable type floor, repaired three responsive dark-theme governance routes, and restored the governance-setup launch step | Current `main` |
| 2026-08-26 | Ten-route patient experience batch | Added one route-scoped reflow and dark-theme contract across health profile, facilities, complaints, accessibility, consents, notification preferences, privacy rights, emergency profile, account security, and health library | Current `main` |
| 2026-08-26 | Finance and provider experience batch | Added one route-family reflow and dark-theme contract across eight payment/finance workspaces and four provider governance workspaces | Current `main` |
| 2026-08-26 | Records and document experience batch | Added one route-family reflow, dialog containment, and dark-theme contract across twelve patient, provider, and operations workspaces | Current `main` |
| 2026-08-26 | Care-journey experience batch | Added one route-family navigation, form, reflow, and dark-theme contract across twelve appointment and continuity workspaces | Current `main` |
| 2026-08-26 | Clinical-services experience batch | Added one route-family status, navigation, reflow, and dark-theme contract across ten patient clinical-service workspaces | Current `main` |
| 2026-08-26 | Provider care-delivery experience batch | Added one provider-console geometry, mobile-navigation, action-form, and dark-theme contract across ten care-delivery workspaces | Current `main` |
| 2026-08-26 | Partner and admin operations experience batch | Added one operational-console geometry, queue, form, mobile-navigation, and dark-theme contract across twenty partner and governance workspaces | Current `main` |

## Required update sequence

1. Select the first unblocked `NEXT` item and mark it `IN PROGRESS` before editing implementation files.
2. Implement a complete batch, not a single cosmetic fragment.
3. Run one consolidated focused test gate and one production build for the batch.
4. If clean, mark the task `DONE`, select the next item, and update the completion log in the same commit.
5. Push once and verify the production deployment, health endpoint, and runtime errors.
6. Leave external-intervention items `BLOCKED`; do not silently activate them.
