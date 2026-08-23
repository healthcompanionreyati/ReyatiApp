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

## Reconciliation boundary

The admin finance view reports recorded ledger totals and processor-event health. The control plane may execute only an independently approved full Stripe refund when its separate activation gate is enabled. It does not reconcile bank statements, calculate provider payables, perform partial or automatic refunds, or initiate payouts.

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
