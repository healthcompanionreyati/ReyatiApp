# ADR-025: Care Navigator safety foundation

- Status: Accepted for foundation implementation
- Date: 2026-08-16

## Decision

Reyati will provide an authenticated, bilingual Care Navigator that suggests a possible care starting point from structured answers. It is not a diagnostic device and does not produce a diagnosis, disease probability, treatment recommendation, medication advice, or a statement that the person is safe.

Emergency handling always runs before routing. Every emergency red-flag question requires an explicit Yes or No answer. Any positive red flag stops routing, suppresses specialty and provider suggestions, and displays Qatar emergency service number 999. The official emergency number and wording must be revalidated before pilot activation.

Non-emergency routing uses a versioned, deterministic ruleset and only structured fields. Free-text medical narratives and model assistance are disabled. If the answers do not support one bounded route, the navigator returns an explicit insufficient-information state and directs the patient to support. A route may show only providers that are already verified and published in the Reyati catalog.

The patient gives purpose-specific consent before assessment. Each assessment records the consent version, ruleset version, outcome, preparation prompts, shortlist identifiers, and any subsequent patient decision in account-owned durable history. Audit metadata records the decision class and provenance but excludes red-flag answers and concern details.

## Clinical and operational gate

The implemented rules are foundation content and are not clinically approved. Controlled-pilot use requires independent clinical review, bilingual content validation, documented false-negative and false-positive evaluation, emergency-path testing, accountable content ownership, and an approved change process. Model assistance and free-text collection remain disabled unless separately designed and approved.

## Consequences

The navigator can orient an authenticated patient without pretending to diagnose. It fails closed when required answers, consent, identity, database access, or a recognized route are unavailable. Emergency results never continue into provider matching. Ruleset provenance makes future clinical review and rollback possible without rewriting historical assessments.
