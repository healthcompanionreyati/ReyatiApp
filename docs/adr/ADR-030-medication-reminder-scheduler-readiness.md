# ADR-030 — Medication reminder scheduler readiness

## Decision

Reyati evaluates medication reminder scheduling with a fixed bilingual synthetic suite before enabling occurrence creation or notification delivery. The suite covers Qatar-local conversion, morning and evening times, repeated scheduler ticks, not-due times, paused and archived plans, date bounds, and a prohibited OCR source.

Each run is durable and records scenario totals, failures, duplicate occurrences, invalid-source occurrences, and delivery attempts. The application audit contains only operational counts and stable references; it excludes medication names, directions, patient data, and document content.

## Safety boundary

The evaluator is deterministic and synthetic-only. It does not read patient reminder plans, materialize due occurrences, enqueue notifications, claim adherence, or activate OCR imports. Repeated ticks are deduplicated inside evaluation, and any source other than explicit patient entry is blocked before time evaluation.

Passing the suite is evidence, not activation approval. Hosted scheduler reliability, timezone and travel policy, approved bilingual wording, monitoring, independent review, verified clinical-source policy, and separate occurrence and delivery activation decisions remain required.

## Consequences

Reyati can demonstrate measurable scheduling safety and lifecycle gating without sending a medication reminder or converting unverified clinical content into action.
