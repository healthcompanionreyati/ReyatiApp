# Stripe payments activation

Qivaya uses Stripe-hosted Checkout. Qivaya does not collect or store card numbers and does not create provider payouts or settlements. The payment ledger changes only after a signed Stripe webhook is verified.

Full refunds use the finance maker-checker workflow. A separate platform administrator may execute an independently approved full-value refund only when `QIVAYA_STRIPE_REFUNDS=true`. Partial refunds, automatic refunds, payouts, and settlements remain unavailable.

## Production prerequisites

1. Apply payment migrations through `drizzle/0098_left_beast.sql` to the production D1 database.
2. In Stripe, create a webhook endpoint for `https://www.qivaya.com/api/webhooks/stripe`.
3. Subscribe the endpoint to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `refund.created`
   - `refund.updated`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.updated`
   - `charge.dispute.funds_withdrawn`
   - `charge.dispute.funds_reinstated`
   - `charge.dispute.closed`
4. Add these encrypted Vercel environment variables to Production only:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `QIVAYA_STRIPE_MODE=test` during test-mode validation, then `live` only with a live key
   - `QIVAYA_STRIPE_PAYMENTS=false`
   - `QIVAYA_STRIPE_REFUNDS=false`
   - `QIVAYA_STRIPE_RECONCILIATION=false`
5. Confirm `REYATI_APP_URL=https://www.qivaya.com`.

Never put secret values in Git, tickets, screenshots, or support messages.

## Validation and activation

1. Keep `QIVAYA_STRIPE_PAYMENTS=false` while deploying code and applying the migration.
2. Configure Stripe test-mode keys and the signed webhook endpoint.
3. Set `QIVAYA_STRIPE_MODE=test` and `QIVAYA_STRIPE_PAYMENTS=true` in a protected preview environment.
4. Complete one successful checkout, one failed checkout, and one externally initiated refund. Confirm:
   - Qivaya never receives card data.
   - Checkout request replay returns the same open session.
   - Replayed webhook events do not duplicate notifications or ledger transitions.
   - The patient payment record and admin aggregate show only signed provider-confirmed states.
5. Switch to live credentials and `QIVAYA_STRIPE_MODE=live` only after the test evidence is approved.
6. Set `QIVAYA_STRIPE_PAYMENTS=true` in Production and redeploy.

## Refund activation

1. Complete checkout activation and confirm signed `refund.created`, `refund.updated`, and `charge.refunded` events reach the webhook.
2. Confirm at least two active platform administrators are available for maker-checker separation.
3. Run a Stripe test-mode full refund through `/admin/finance-controls` and verify the maker cannot execute it, request replay is idempotent, and the ledger remains paid until the signed webhook arrives.
4. Confirm provider execution becomes confirmed after the webhook, then append reconciliation evidence before closing the case.
5. Set `QIVAYA_STRIPE_REFUNDS=true` only in the intended environment.
6. Keep the flag off to disable new refund requests without affecting existing payment records or webhook reconciliation.

## Reconciliation activation

1. Keep `QIVAYA_STRIPE_RECONCILIATION=false` until checkout and webhook validation are complete.
2. Confirm the Stripe secret has read access to balance transactions in the intended test or live account.
3. Set `QIVAYA_STRIPE_RECONCILIATION=true` in the intended environment and redeploy.
4. From `/admin/payment-reconciliation`, run a completed window no longer than seven days.
5. Review every exception. The module reads and compares provider evidence; it never changes the payment ledger, issues refunds, creates payouts, or corrects provider data.
6. A run is marked incomplete if the provider window exceeds the bounded 1,000-item import. Use smaller non-overlapping windows rather than expanding the limit.

## Rollback

Set `QIVAYA_STRIPE_RECONCILIATION=false` to stop new reconciliation runs. Set `QIVAYA_STRIPE_REFUNDS=false` to stop new refund execution. Set `QIVAYA_STRIPE_PAYMENTS=false` to also remove checkout availability and cause the webhook endpoint to return unavailable. None of these rollbacks delete ledger, checkout, refund-execution, reconciliation, or processor-event history. Do not remove the database tables during an operational rollback.

## Zero-effect lifecycle rehearsal

1. Open `/admin/payment-lifecycle-rehearsal` with an active platform administrator role. Security auditors have read-only access to the evidence ledger.
2. Run the complete ten-scenario suite before enabling or changing any payment-provider gate.
3. The suite models hosted checkout, signed transition, duplicate-event idempotency, immutable receipt creation, private PDF integrity, minimal email intent, receipt-preserving refund, and exact reconciliation entirely in memory.
4. A successful run persists only its rehearsal evidence row and audit event. It must report zero Stripe calls, R2 writes, emails, money movement, customer records, and operational payment records.
5. Treat any failed scenario or non-zero side-effect counter as a release blocker. The rehearsal does not replace Stripe test-mode acceptance, signed-webhook monitoring, or reconciliation review.

## Stripe test-mode acceptance evidence

1. Keep Stripe in test mode and complete one real hosted checkout, signed payment webhook, receipt/PDF/email intent, independently approved full refund, signed refund webhook, credit-note/PDF/email intent, and read-only reconciliation match.
2. Open `/admin/payment-acceptance` as the platform administrator who operated the test. Enter the `pi_…` payment-intent ID and `re_…` refund ID from the same lifecycle.
3. The collector retrieves only those Stripe test objects and correlates them with Qivaya records. It refuses live-mode objects and cannot create checkout sessions, issue refunds, send email, write R2, change the ledger, or change environment gates.
4. Resolve every failed check and collect a new run. Do not approve a partially passing run.
5. A different active platform administrator or security auditor reviews the fully passing evidence. The collector cannot approve their own run.
6. Treat one fully passing, independently approved run as a prerequisite for any live-mode change. Approval records evidence only; it never enables live mode automatically.

## Reconciliation boundary

The admin finance view reports recorded ledger totals and processor-event health. The control plane may execute only an independently approved full Stripe refund when its separate activation gate is enabled. It does not reconcile bank statements, calculate provider payables, perform partial or automatic refunds, or initiate payouts.

## Payment go-live readiness decision

1. Keep Stripe in test mode. Complete the zero-effect lifecycle rehearsal and obtain an independently approved, fully passing Stripe test-acceptance run.
2. Confirm signed payment and refund webhook processing, a completed reconciliation window without exceptions, a provider-confirmed refund, ready receipt and credit-note PDF artifacts in private R2, and both preference-aware document email intents.
3. Confirm the Resend delivery and webhook path is configured and at least two distinct active platform administrators or security auditors are available.
4. Open `/admin/payment-go-live` as a platform administrator and prepare a new readiness snapshot. Resolve every blocked check and prepare a new immutable snapshot; never alter an earlier result.
5. A different active platform administrator or security auditor records the final Go or No-Go decision. The preparer cannot review the same snapshot, and Go is unavailable unless all eleven checks pass.
6. The decision is evidence only. It cannot switch credentials, change a Vercel environment variable, enable a gate, create a charge or refund, send email, write an R2 object, or mutate the financial ledger. Perform any approved activation separately under the change-management procedure.

## Controlled production activation window

1. After a fully passing Go decision is independently recorded, open `/admin/payment-activation` and prepare a production window scheduled within 30 days and lasting 15 minutes to 4 hours.
2. Name separate change, monitoring, and rollback owners and select a monitoring period of 15 to 240 minutes. Do not put passwords, keys, webhook secrets, or customer information in any owner field or review note.
3. A different active platform administrator or security auditor reviews the window. The preparer cannot approve their own window.
4. A platform administrator may open the approved window from 15 minutes before its start until its end. Opening revalidates the unchanged Go decision and complete Stripe test-mode checkout, webhook, refund, and reconciliation controls.
5. Make the separately approved Vercel environment and Stripe credential changes manually. This module cannot edit environment variables, store credentials, deploy code, call Stripe mutations, move money, change the ledger, send email, or write R2 objects.
6. After redeployment, choose **Verify live activation** only when the server observes live mode plus complete checkout, signed-webhook, refund, and reconciliation readiness. If rollback is required, disable checkout under the rollback procedure and choose **Verify rollback** only after the server observes containment.

## Post-activation stability assurance

1. Open `/admin/payment-assurance` only after a live activation window is closed as **activation verified**.
2. Wait for the complete monitoring period named in the activation window. The server will refuse early evidence collection.
3. Collect the fourteen-check snapshot. It reads server configuration and aggregate D1 counters only. It does not call Stripe or expose provider identifiers, credentials, customer data, payment amounts, or raw webhook payloads.
4. A different active platform administrator or security auditor reviews the result. **Confirm stabilized** is available only when all checks pass. **Require rollback** always requires a written review note.
5. A rollback-required decision is evidence, not execution. Follow the emergency rollback procedure above through an independently approved Vercel change.
6. After the payment and checkout gates are disabled, an authorized user who did not collect the snapshot may choose **Verify rollback containment**. The server records containment only when checkout is observed disabled.
7. Preserve the activation window, assurance snapshot, coded assurance events, reconciliation evidence, and audit history. Never delete these records as part of rollback.
7. Continue the named monitoring period and use `/admin/operations`, `/admin/payment-reconciliation`, `/admin/payment-disputes`, `/admin/communications`, and `/admin/audit` for operational evidence. A verified configuration is not evidence of a successful patient charge.

## Payment incident command and recovery

1. Open `/admin/payment-incidents` when monitoring, reconciliation, refund operations, configuration, checkout, or the post-activation assurance ledger reveals a production payment signal.
2. Select only the coded severity and signal. Assign two different active platform administrators or security auditors as owner and backup, and set a severity-bounded containment target. Never enter credentials, customer data, payment identifiers, amounts, or raw provider payloads.
3. Execute containment separately under the approved Stripe and Vercel operating procedure. The named owner or backup records the coded result; **Checkout disabled** is accepted only when the server observes payment and checkout gates disabled.
4. A platform administrator prepares coded recovery evidence after containment. The incident stays open until a different active platform administrator or security auditor makes the recovery decision.
5. **Close recovered** requires all live payment controls to be ready and no failed or waiting processor event in the last fifteen minutes. **Close contained** requires checkout to remain disabled. **Return** sends the incident back to containment for revised evidence.
6. Preserve the incident, coded events, assurance source, reconciliation evidence, and audit ledger. This module cannot change Stripe, Vercel, credentials, deployments, money, financial records, email, or R2 objects.

## Dispute monitoring

1. Enable all five `charge.dispute.*` webhook events listed above on the same signed endpoint.
2. Use `/admin/payment-disputes` to monitor the provider lifecycle and identify unlinked events.
3. Keep dispute status separate from payment and refund status. The workspace never rewrites the ledger.
4. Accept or challenge a dispute and submit evidence only through the approved Stripe operating procedure. Qivaya does not automate those actions.
5. Confirm patient notifications reveal only the dispute status and direct the account owner to payment support; raw webhook payloads and evidence contents are not stored.

## Receipts and credit notes

1. A successful signed payment event creates one immutable receipt snapshot for the owned payment-ledger entry.
2. A successful signed refund event creates a separate immutable credit note; it never rewrites or deletes the original receipt.
3. Patients access their documents at `/payment-receipts`; delegated access requires the active `payments` family permission.
4. Administrators access a patient-identity-free register at `/admin/payment-receipts`.
5. These documents are payment-status records, not tax invoices, provider settlement statements, or payout instructions. Card data and raw Stripe payloads are never stored.

## Receipt email delivery

1. A signed successful-payment event queues `payment_receipt_ready`; a signed completed-refund event queues `payment_credit_note_ready`.
2. Delivery uses the existing D1 outbox and deterministic document idempotency key. Replayed Stripe events cannot create duplicate email sends.
3. Delivery requires the production email gate, a verified primary contact, the email master preference, and the enabled support-service email category. In-app documents remain available if any condition blocks email.
4. Email contains only a secure link and generic document-ready copy. It does not contain the amount, provider, appointment, patient, card, or refund details.
5. Resend webhook outcomes are authoritative for delivered, delayed, bounced, complaint, or failed status. Operators inspect and process due retries through `/admin/communications`; the receipt register does not bypass suppression or retry policy.

## Private PDF artifacts

1. A newly recorded receipt or credit note attempts immediate server-side PDF generation. Existing records generate their artifact on the account owner's first download request.
2. Generated bytes contain the immutable financial snapshot but no patient identity, card credential, raw Stripe payload, settlement instruction, or tax-invoice claim.
3. Store the artifact under the private `documents/YYYY/MM/<document-id>` namespace in the production R2 bucket. Never enable a public bucket URL.
4. D1 stores the object key, byte size, SHA-256 checksum, category, owner, and lifecycle status. The PDF is marked `system_generated`, `ready`, and `clean` because no user-controlled bytes enter the generator.
5. Download uses the existing 60-second, hashed, single-use document grant. Delivery rechecks ownership, object size, MIME type, and SHA-256 before returning bytes; mismatches are quarantined and audited.
6. Family delegates may view payment records only with active `payments` authority but cannot download the owner's PDF. Administrators see aggregate artifact readiness without patient identity or object keys.
7. Generated artifacts participate in the existing legal-hold, retention, verified-deletion, recovery, and audit controls for private documents.
