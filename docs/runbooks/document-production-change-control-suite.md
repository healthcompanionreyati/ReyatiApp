# Medical-document production change control

## Purpose

This suite separates a production activation into four protected workspaces: bounded window preparation, independent review, posture observation and verification, and rollback control. The existing document-activation service remains the only durable workflow engine.

## Operating sequence

1. `/admin/document-change-window` accepts coded evidence, a future 30-minute-to-four-hour window, and three distinct owners only after the complete activation preflight passes.
2. `/admin/document-change-review` requires another authorized operator to approve or return the package. Approval does not open the window.
3. `/admin/document-change-observation` opens an approved window only during its time boundary, records safe aggregate posture, and requires an operator different from both preparer and opener to verify the target posture.
4. `/admin/document-rollback-control` records rollback intent and independently verifies containment only after dispatch, polling, retention execution, and deletion processing are observed disabled.

## Hard boundaries

The suite does not deploy code, modify Vercel or Cloudflare configuration, read or write credentials, call a scanner, read patient records, write or delete R2 objects, or call an external service. Infrastructure changes and rollback execution remain manual, separately authorized procedures. The application records decisions and safe observed booleans only.

## Failure handling

- Every endpoint requires an active authenticated account and an authorized platform role.
- Writes are rate limited, body size is bounded, responses are private and `no-store`, and stale versions fail with conflict responses.
- A returned package must be prepared again through the durable workflow.
- An unsafe or expired observed posture moves to `rollback_required`.
- The opener cannot verify rollback; the preparer or opener cannot verify activation.

## Operator handoff

Use the stage navigation rather than the complete ledger for normal operation. The complete `/admin/document-activation` ledger remains available for audit and recovery. After independent target verification, continue to production lifecycle acceptance. After rollback containment, open document incident command when follow-up is required.
