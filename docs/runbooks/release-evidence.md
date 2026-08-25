# Production release evidence

Every production release must retain one machine-readable evidence record after the Vercel deployment is ready. The collector fails closed unless all of these inputs are present and healthy:

- the exact expected release SHA;
- a successful production build;
- at least one expand-only SQL migration in the repository;
- an explicit privacy-safe runtime-error scan count;
- the six-route production-readiness result, including health, security headers, brand identity, and the protected-route boundary.

Run after deployment and the runtime-log scan:

```powershell
$env:QIVAYA_EXPECTED_RELEASE = "<git-sha>"
$env:QIVAYA_BUILD_VERIFIED = "true"
$env:QIVAYA_RUNTIME_ERROR_COUNT = "0"
$env:QIVAYA_EVIDENCE_FILE = "docs/evidence/releases/<git-sha>.json"
npm run evidence:release
```

The command exits non-zero if any required evidence is missing or failed. It never includes session tokens, response bodies, environment values, patient data, or log payloads. The runtime error count must come from the bounded Vercel runtime-log scan for the same release; do not infer zero from a healthy HTTP response.
