# Stripe payments activation

Qivaya uses Stripe-hosted Checkout. Qivaya does not collect or store card numbers, does not initiate automatic refunds, and does not create provider payouts or settlements. The payment ledger changes only after a signed Stripe webhook is verified.

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

## Rollback

Set `QIVAYA_STRIPE_PAYMENTS=false` and redeploy. This immediately removes checkout availability and causes the webhook endpoint to return unavailable without deleting ledger, checkout, or processor-event history. Do not remove the database tables during an operational rollback.

## Reconciliation boundary

The admin finance view reports recorded ledger totals and processor-event health. It does not reconcile bank statements, calculate provider payables, execute refunds, move funds, or initiate payouts. Those capabilities require separate approved modules and operating controls.
