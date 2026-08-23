import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentCheckoutSessions, paymentReconciliationItems, paymentReconciliationRuns } from "@/db/payment-processing-schema";
import { auditEvents, paymentLedgerEntries } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getPaymentProviderStatus, getStripeReconciliationClient, PaymentConflictError, PaymentValidationError } from "@/lib/stripe-payments";

const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PROVIDER_ITEMS = 1000;

function identifier(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new PaymentValidationError(`${name} is invalid`);
  return value;
}

function date(value: unknown, name: string) {
  if (typeof value !== "string") throw new PaymentValidationError(`${name} is required`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) throw new PaymentValidationError(`${name} is invalid`);
  return parsed;
}

function objectId(value: unknown) {
  if (typeof value === "string") return value;
  return value && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string" ? String((value as Record<string, unknown>).id) : null;
}

function paymentIntentFromSource(source: unknown) {
  if (!source || typeof source !== "object") return null;
  return objectId((source as Record<string, unknown>).payment_intent);
}

export async function getStripeReconciliationWorkspace(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb();
  const runs = await db.select().from(paymentReconciliationRuns).orderBy(desc(paymentReconciliationRuns.createdAt)).limit(30);
  const items = await db.select().from(paymentReconciliationItems).orderBy(desc(paymentReconciliationItems.createdAt)).limit(500);
  return { runs, items, provider: await getPaymentProviderStatus(), boundaries: { readOnlyProviderSource: true, automaticCorrection: false, payouts: false, settlements: false, cardDataStored: false, maximumWindowDays: 7, maximumProviderItems: MAX_PROVIDER_ITEMS } };
}

export async function runStripeReconciliation(userId: string, body: Record<string, unknown>, requestKey: unknown) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const clientRequestId = identifier(requestKey, "Idempotency-Key");
  const windowStart = date(body.windowStart, "windowStart"), windowEnd = date(body.windowEnd, "windowEnd"), now = new Date();
  if (windowEnd <= windowStart || windowEnd.valueOf() - windowStart.valueOf() > MAX_WINDOW_MS || windowEnd > now) throw new PaymentValidationError("Choose a completed window no longer than seven days");
  const db = await getDb();
  const replay = (await db.select().from(paymentReconciliationRuns).where(and(eq(paymentReconciliationRuns.requestedByUserId, userId), eq(paymentReconciliationRuns.clientRequestId, clientRequestId))).limit(1))[0];
  if (replay) return { id: replay.id, status: replay.status, replayed: true };
  const duplicateWindow = (await db.select({ id: paymentReconciliationRuns.id }).from(paymentReconciliationRuns).where(and(eq(paymentReconciliationRuns.windowStart, windowStart), eq(paymentReconciliationRuns.windowEnd, windowEnd))).limit(1))[0];
  if (duplicateWindow) throw new PaymentConflictError("This exact provider window already has a reconciliation run");

  const runId = crypto.randomUUID();
  await db.insert(paymentReconciliationRuns).values({ id: runId, requestedByUserId: userId, clientRequestId, provider: "stripe", windowStart, windowEnd, status: "running", providerItemCount: 0, matchedItemCount: 0, exceptionItemCount: 0, informationalItemCount: 0, grossMinor: 0, feeMinor: 0, netMinor: 0, currency: "qar", failureCode: null, createdAt: now, completedAt: null });
  try {
    const { stripe } = await getStripeReconciliationClient();
    const providerRows = await stripe.balanceTransactions.list({ created: { gte: Math.floor(windowStart.valueOf() / 1000), lt: Math.floor(windowEnd.valueOf() / 1000) }, limit: 100, expand: ["data.source"] }).autoPagingToArray({ limit: MAX_PROVIDER_ITEMS + 1 });
    const truncated = providerRows.length > MAX_PROVIDER_ITEMS;
    const rows = providerRows.slice(0, MAX_PROVIDER_ITEMS);
    const checkoutRows = await db.select({ paymentIntentId: paymentCheckoutSessions.providerPaymentIntentId, ledgerEntryId: paymentCheckoutSessions.ledgerEntryId }).from(paymentCheckoutSessions).where(isNotNull(paymentCheckoutSessions.providerPaymentIntentId)).orderBy(desc(paymentCheckoutSessions.createdAt)).limit(5000);
    const ledgerRows = await db.select({ id: paymentLedgerEntries.id, amountQar: paymentLedgerEntries.amountQar }).from(paymentLedgerEntries).orderBy(desc(paymentLedgerEntries.statusUpdatedAt)).limit(5000);
    const intentToLedger = new Map(checkoutRows.map(row => [row.paymentIntentId, row.ledgerEntryId]));
    const ledgerById = new Map(ledgerRows.map(row => [row.id, row]));
    const createdAt = new Date();
    const items = rows.map(row => {
      const paymentIntentId = paymentIntentFromSource(row.source), ledgerEntryId = paymentIntentId ? intentToLedger.get(paymentIntentId) ?? null : null;
      const ledger = ledgerEntryId ? ledgerById.get(ledgerEntryId) : null;
      const expectedAmountMinor = ledger ? ledger.amountQar * 100 : null;
      const relevant = row.type === "charge" || row.type.includes("refund");
      const currencyMatches = row.currency.toLowerCase() === "qar";
      const amountMatches = expectedAmountMinor != null && Math.abs(row.amount) === expectedAmountMinor;
      const matchStatus = ledger && currencyMatches && amountMatches ? "matched" : relevant ? "exception" : "informational";
      const reasonCode = matchStatus === "matched" ? null : !relevant ? "non_ledger_provider_item" : !ledger ? "local_reference_missing" : !currencyMatches ? "currency_mismatch" : "amount_mismatch";
      return { id: crypto.randomUUID(), runId, ledgerEntryId, provider: "stripe", providerBalanceTransactionId: row.id, providerType: row.type, amountMinor: row.amount, feeMinor: row.fee, netMinor: row.net, expectedAmountMinor, currency: row.currency.toLowerCase(), matchStatus, reasonCode, providerCreatedAt: new Date(row.created * 1000), providerAvailableOn: new Date(row.available_on * 1000), createdAt };
    });
    for (let offset = 0; offset < items.length; offset += 40) await db.insert(paymentReconciliationItems).values(items.slice(offset, offset + 40)).onConflictDoNothing();
    const matchedItemCount = items.filter(item => item.matchStatus === "matched").length;
    const exceptionItemCount = items.filter(item => item.matchStatus === "exception").length + (truncated ? 1 : 0);
    const informationalItemCount = items.filter(item => item.matchStatus === "informational").length;
    const status = truncated ? "incomplete" : exceptionItemCount ? "exceptions_open" : "matched";
    const qarItems = items.filter(item => item.currency === "qar");
    await db.batch([
      db.update(paymentReconciliationRuns).set({ status, providerItemCount: rows.length, matchedItemCount, exceptionItemCount, informationalItemCount, grossMinor: qarItems.reduce((sum, item) => sum + item.amountMinor, 0), feeMinor: qarItems.reduce((sum, item) => sum + item.feeMinor, 0), netMinor: qarItems.reduce((sum, item) => sum + item.netMinor, 0), currency: "qar", failureCode: truncated ? "provider_item_limit" : null, completedAt: new Date() }).where(eq(paymentReconciliationRuns.id, runId)),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "finance_control.stripe_reconciliation_completed", resourceType: "payment_reconciliation_run", resourceId: runId, outcome: status === "matched" ? "success" : "review_required", metadataJson: JSON.stringify({ providerItemCount: rows.length, matchedItemCount, exceptionItemCount, informationalItemCount, truncated, providerIdentifiersIncluded: false, cardDataStored: false, moneyMovementExecuted: false }), createdAt: new Date() }),
    ]);
    return { id: runId, status, providerItemCount: rows.length, matchedItemCount, exceptionItemCount, informationalItemCount, replayed: false };
  } catch (error) {
    await db.update(paymentReconciliationRuns).set({ status: "failed", failureCode: error instanceof Error ? error.name : "provider_error", completedAt: new Date() }).where(eq(paymentReconciliationRuns.id, runId));
    throw error;
  }
}
