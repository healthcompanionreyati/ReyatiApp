# ADR-019: Controlled pilot learning governance

- Status: Accepted implementation foundation
- Date: 2026-08-15

## Decision

Reyati separates success-metric definitions from measured outcomes. A metric definition is bound to one controlled-pilot plan and records a stable key, definition version, calculation definition, unit, direction, target, minimum sample size, evidence-source reference, preparer, independent reviewer, status, optimistic version, and immutable event trail. Approval of a newer definition retires the previous approved definition for the same metric.

The feedback register accepts only synthetic dry-run evidence while real participant enrollment and consent remain disabled. Entries use bounded personas, categories and severities. Free text is length-bounded and rejects obvious contact identifiers and clinical-content terms. General audit metadata excludes the feedback text.

No metric result, satisfaction claim, clinical outcome, or real participant feedback is recorded by this foundation. Real collection requires approved consent and privacy wording, an activated pilot, identity-bound enrollment, minimum-sample rules, reviewed measurement procedures, and a separate activation decision.

## Consequences

Operators can agree what success means and rehearse the feedback-resolution workflow without fabricating outcomes. The platform preserves a clear boundary between an approved measurement protocol and future evidence collected under a legitimate pilot.
