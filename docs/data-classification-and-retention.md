# Data classification and retention baseline

Reyati classifies data as public, operational, account, clinical, financial, or secret. Runtime metadata lives in `lib/data-classification.ts`.

Only public and operational data may enter telemetry. Account identifiers, contact details, clinical content, financial content, request bodies, credentials, tokens, cookies, authorization headers, and raw error messages are prohibited from application logs.

Operational telemetry defaults to 30 days. Public product records may remain while published. Account, clinical, and financial schedules remain launch blockers until the responsible owner and qualified Qatar legal/privacy counsel approve them. Secrets must never be logged and should be persisted only when encrypted or irreversibly hashed for a documented purpose.

Deletion and legal-hold implementation must follow the approved record schedule; the application must not invent those periods.
