# ADR-004: Arabic localization boundary

- Status: Accepted implementation foundation; human linguistic QA pending
- Date: 2026-08-15

## Decision

Reyati uses one persisted account locale across patient, provider, and platform workspaces. Critical navigation, forms, loading and recovery states, sensitive confirmations, document-consent controls, appointment lifecycles, dates, times, numbers, and known status values must render in Arabic when the locale is `ar`. Direction is applied at the document and workspace boundaries, with logical CSS positioning and explicit left-to-right isolation for email addresses, URLs, telephone numbers, and opaque identifiers.

Shared locale helpers own Qatar time-zone formatting, Arabic digits, and known lifecycle vocabulary. Server-provided clinical, organization, provider, and patient names remain source data and are not machine-translated. Unknown server errors use a safe localized fallback instead of displaying untranslated operational text in an Arabic workflow.

## Consequences

Automated tests prevent critical Arabic journeys from reverting to English-only dates, statuses, consent dialogs, delegated-booking notices, or sensitive-action chrome. This is an implementation-complete bilingual interface boundary, not evidence of completed linguistic, clinical, legal, screen-reader, or device QA. Native Arabic reviewers must validate terminology and representative assistive-technology journeys before pilot readiness.
