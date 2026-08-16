# ADR-026: Care Navigator governance and synthetic safety evaluation

- Status: Accepted for foundation implementation
- Date: 2026-08-16

## Decision

Every Care Navigator ruleset is registered as an immutable, uniquely versioned governance record with a stable source reference, rule counts, preparer, independent reviewer, event history, and explicit clinical-approval status.

The deployed foundation rules are evaluated through the same deterministic function used by the patient workflow. The standard suite contains paired English and Arabic synthetic scenarios covering every emergency red flag, bounded specialty routes, child routing, mode preference, and the insufficient-information outcome. It contains no patient record, free-text medical narrative, diagnosis, or model-generated input.

Submission for governance review requires the complete standard suite and a current passing run with:

- 100% emergency recall;
- 100% expected route and specialty accuracy;
- 100% English/Arabic output parity;
- zero critical failures; and
- emergency suppression of specialty and visit-mode output.

A security auditor who did not prepare the ruleset may approve or reject the governance evidence. That decision is recorded optimistically and audited. Governance approval does not grant clinical approval, change the patient runtime, activate a new ruleset, or establish clinical safety or effectiveness.

## Consequences

Reyati gains traceable and repeatable regression evidence before clinical review. The centre remains a synthetic foundation: clinical approval and runtime activation are hard-disabled and require accountable clinical ownership, independent bilingual clinical validation, broader edge-case evaluation, approved change control, and a separate activation decision.
