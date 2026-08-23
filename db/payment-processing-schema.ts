import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { paymentLedgerEntries, users } from "./schema";

export const paymentCheckoutSessions = sqliteTable("payment_checkout_sessions", {
  id: text("id").primaryKey(),
  ledgerEntryId: text("ledger_entry_id").notNull().references(() => paymentLedgerEntries.id, { onDelete: "restrict" }),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  clientRequestId: text("client_request_id").notNull(),
  provider: text("provider").notNull().default("stripe"),
  providerSessionId: text("provider_session_id").notNull(),
  providerPaymentIntentId: text("provider_payment_intent_id"),
  status: text("status").notNull().default("open"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_payment_checkout_provider_session").on(table.provider, table.providerSessionId),
  uniqueIndex("idx_payment_checkout_provider_intent").on(table.provider, table.providerPaymentIntentId),
  uniqueIndex("idx_payment_checkout_client_request").on(table.createdByUserId, table.ledgerEntryId, table.clientRequestId),
  index("idx_payment_checkout_ledger_status_created").on(table.ledgerEntryId, table.status, table.createdAt),
]);

export const paymentProcessorEvents = sqliteTable("payment_processor_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().default("stripe"),
  providerEventId: text("provider_event_id").notNull(),
  eventType: text("event_type").notNull(),
  processingStatus: text("processing_status").notNull().default("received"),
  ledgerEntryId: text("ledger_entry_id").references(() => paymentLedgerEntries.id, { onDelete: "restrict" }),
  errorCode: text("error_code"),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
}, (table) => [
  uniqueIndex("idx_payment_processor_provider_event").on(table.provider, table.providerEventId),
  index("idx_payment_processor_status_received").on(table.processingStatus, table.receivedAt),
  index("idx_payment_processor_ledger_received").on(table.ledgerEntryId, table.receivedAt),
]);
