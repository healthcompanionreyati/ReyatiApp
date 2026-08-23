# Stripe payments activation

Qivaya uses Stripe-hosted Checkout. Qivaya does not collect or store card numbers and does not create provider payouts or settlements. The payment ledger changes only after a signed Stripe webhook is verified.

Full refunds use the finance maker-checker workflow. A separate platform administrator may execute an independently approved full-value refund only when `QIVAYA_STRIPE_REFUNDS=true`. Partial refunds, automatic refunds, payouts, and settlements remain unavailable.

## Production prerequisites

1. Apply database migration `drizzle/0095_grey_mother_askani.sql` to the production D1 database.
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
