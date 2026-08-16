# ADR-027 — Prescription intelligence safety foundation

## Decision

Reyati provides a durable, synthetic-only prescription extraction evaluation workflow before connecting an OCR vendor. Every extracted field retains a source checksum, source reference, page, region, confidence score, engine alias, and model version. An active verified provider must explicitly accept or reject each synthetic case. The evaluation fails if any unsafe case is accepted.

## Safety boundary

This foundation does not create or alter patient records. It cannot generate a prescription, medication schedule, reminder, refill, referral, laboratory order, or any clinical instruction. OCR dispatch and patient-record commit are separate hard-disabled capabilities. Confidence is review-prioritization evidence, never clinical truth and never a substitute for human verification.

Only fixed English and Arabic synthetic fixtures may enter the active workflow. Real document intake requires the protected upload, scanning, consent, retention, and delivery controls to be activated first. Production activation additionally requires an approved OCR vendor and model, bilingual clinical evaluation, qualified-reviewer policy, error and rollback procedures, and a separate authorization decision.

## Consequences

The product can demonstrate traceable extraction, confidence boundaries, clinician review, optimistic concurrency, audit evidence, and measurable unsafe-acceptance thresholds without exposing patients or implying that prescription automation is available.
