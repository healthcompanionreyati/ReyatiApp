# Authenticated browser smoke evidence — 2026-08-25

Target: `https://www.qivaya.com`

Mode: read-only browser inspection using the existing signed-in synthetic/owner account. No forms were submitted and no application records were changed.

| Journey | Result | Evidence |
| --- | --- | --- |
| Patient home | Pass | Qivaya title, patient navigation and care-workspace headings rendered; no console errors observed. |
| Patient document capture | Partial | Workspace rendered, but the records request showed a generic failure. The batch replaced the generic failure with authorization, throttling, unavailable-service, and no-write messages. |
| Provider workspace | Correctly denied | The current account has no verified provider profile. The workspace failed closed with a visible provider-profile requirement and no console errors. |
| Platform operations | Pass | Operations overview, recorded state, activity, finance, and moderation sections rendered; no console errors observed. |

Full three-role production evidence remains blocked until a dedicated short-lived synthetic provider session is available. The repository verifier and runbook are ready and do not record session values or response bodies.
