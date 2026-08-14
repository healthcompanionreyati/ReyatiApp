# Investor demo synchronization policy

The production application is the only source for shared product code. Synchronization is one-way: production code may be promoted into the investor demo after validation; synthetic identities, fixtures, guidance, database contents, and demo hosting configuration must never flow back into production.

Every synchronization must preserve separate `.openai/hosting.json`, Wrangler configuration, database bindings, environment variables, analytics, domains, and secrets. A reviewer must confirm production contains no synthetic records and the investor demo contains no production identifiers or contact data.

The demo must disclose that all people, providers, appointments, records, payments, and metrics are synthetic. External email, SMS, payment, and clinical integrations remain disabled unless separately approved.
