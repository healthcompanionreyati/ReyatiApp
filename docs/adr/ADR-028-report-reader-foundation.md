# ADR-028 — Medical Report Reader safety foundation

## Decision

Reyati provides a durable, bilingual, synthetic-only medical-report extraction evaluation before connecting a document extraction vendor. Each observation retains its report source checksum, source reference, page, region, confidence, value, unit, reference range, and any flag explicitly printed by the source. Active verified providers accept or reject the extraction; an automated evaluation fails on any unsafe acceptance or generated interpretation.

## Safety boundary

This foundation does not diagnose, interpret results, infer normality, recommend treatment, rank urgency, or create or alter patient records. A `high`, `low`, or `normal` marker is presented only when it was explicitly extracted from the source report and is labelled as source-reported. Missing units, conflicting ranges, and ambiguous source evidence require rejection rather than inference.

Dispatch, interpretation, and patient-record commit are separately hard disabled. Real documents remain excluded until secure upload, malware scanning, consent, retention, and private delivery controls are activated. Production use additionally requires vendor and model approval, report-type-specific bilingual clinical evaluation, reviewer qualifications, monitoring, rollback, and a separate activation decision.

## Consequences

The product can demonstrate precise provenance, unit and range preservation, confidence boundaries, provider review, audit evidence, and measurable zero-interpretation safeguards without presenting synthetic results as patient data or claiming clinical intelligence.
