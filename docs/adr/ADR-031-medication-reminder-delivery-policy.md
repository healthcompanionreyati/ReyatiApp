# ADR-031 — Medication reminder delivery policy governance

## Decision

Reyati stores a versioned pre-activation delivery policy for patient-configured medication reminders. The policy fixes generic English and Arabic wording that contains no medication name, dose, directions, diagnosis, or document content. It also records explicit-consent version, Qatar timezone, quiet hours, the rule that quiet-hour exceptions require an explicit patient-selected time, maximum lateness, bounded retries, deduplication window, and distinct primary and backup owners.

An approved policy requires independently verified scheduler evidence. A platform administrator prepares and submits it; a security auditor other than the preparer and primary owner approves or rejects it. Every transition is optimistic, durable, and audited without clinical content.

## Safety boundary

Policy approval does not enable the policy runtime, materialize an occurrence, enqueue a notification, connect a delivery provider, or make an adherence claim. Retries are policy limits only. The application continues to block OCR imports and all outbound reminder delivery.

## Consequences

Reyati can demonstrate accountable, privacy-safe delivery governance before any external vendor or scheduler is connected. Hosted reliability, monitoring, explicit activation authorization, and controlled-pilot validation remain required.
