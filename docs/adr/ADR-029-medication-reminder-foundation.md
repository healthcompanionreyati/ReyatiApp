# ADR-029 — Patient-owned medication reminder foundation

## Decision

Reyati allows an authenticated patient to configure, pause, resume, and archive a manual reminder plan. A plan records the patient-entered label and directions, Qatar-local schedule times, date bounds, acknowledgement version, source provenance, explicit unverified status, optimistic version, and immutable event history.

## Safety boundary

The page is an organization tool, not a prescription or medication instruction. Reyati does not validate the medication, dose, directions, timing, interactions, duration, or suitability. Patients are told to use only instructions supplied by their clinician or pharmacist and not to change therapy based on the feature.

No plan can be imported from prescription OCR, the Report Reader, AI output, or an unapproved provider order. Delivery is hard disabled, so configuring a plan sends no notification and makes no adherence claim. Audit metadata excludes medication labels and directions.

## Consequences

Patients can prepare and manage durable reminder preferences while the platform proves ownership, provenance, acknowledgement, timezone validation, state transitions, and privacy-minimized auditing. Scheduler reliability, approved wording, monitoring, verified clinical-source integration, and a separate activation review remain required before delivery.
