# ADR-014: Privacy-safe observability governance before vendor activation

## Status

Accepted for implementation. External telemetry export remains disabled.

## Decision

Reyati stores one independently reviewed policy for each telemetry class: application errors, performance metrics, and security events. Each policy records only a vendor alias, proposed data region, bounded retention and sampling, and distinct primary and backup owners. Endpoint URLs, API keys, secrets, and patient data are not accepted.

An approved policy may run a local synthetic redaction validation. The validation records aggregate fixture counts and audit evidence but never calls an external vendor. Approval is governance evidence only; it cannot activate export.

## Safety boundary

Clinical notes, prescription or OCR content, document content, patient concerns, authentication tokens, personal identifiers, filenames, and complete sensitive request bodies are prohibited from telemetry. External export requires a separate vendor, legal, security, data-region, credential, and activation review.

## Consequences

Operational readiness can now distinguish missing governance from missing transport. Error and performance monitoring remain partial, and the controlled-pilot monitoring gate remains blocked until all policies are approved and a reviewed external integration is activated.
