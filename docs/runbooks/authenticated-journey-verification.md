# Authenticated journey verification

This read-only release check verifies representative patient, provider, and platform-administrator pages and APIs without changing application data.

## Safety boundary

- Every request uses `GET`.
- Response bodies and session values are never included in output.
- The verifier fails closed for missing role sessions, redirects, authorization failures, non-success responses, and incorrect content types.
- Production requires HTTPS.
- Never commit sessions, paste them into tickets, or store them in evidence artifacts.

## Required secret environment variables

- `QIVAYA_PATIENT_SESSION`
- `QIVAYA_PROVIDER_SESSION`
- `QIVAYA_ADMIN_SESSION`
- `QIVAYA_BASE_URL` (optional; defaults to `https://www.qivaya.com`)

Each session value is the complete short-lived `Cookie` header for a dedicated synthetic account. Store values only in an approved encrypted secret manager and rotate them after controlled verification.

## Run

```bash
npm run verify:authenticated
```

Retain only the JSON result, which contains route names, status codes, durations, and pass/fail reasons. It contains no response payloads or credentials.
