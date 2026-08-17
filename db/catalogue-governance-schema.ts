import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const catalogueItems = sqliteTable("catalogue_items", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  code: text("code").notNull(),
  labelEn: text("label_en").notNull(),
  labelAr: text("label_ar").notNull(),
  descriptionEn: text("description_en").notNull(),
  descriptionAr: text("description_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(100),
  status: text("status").notNull().default("draft"),
  authoredByUserId: text("authored_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewDecision: text("review_decision"),
  reviewReasonCode: text("review_reason_code"),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  activatedByUserId: text("activated_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  activatedAt: integer("activated_at", { mode: "timestamp_ms" }),
  retiredByUserId: text("retired_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  retirementReasonCode: text("retirement_reason_code"),
  retiredAt: integer("retired_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_catalogue_items_category_code").on(table.category, table.code),
  index("idx_catalogue_items_category_status_sort").on(table.category, table.status, table.sortOrder),
  index("idx_catalogue_items_status_updated").on(table.status, table.updatedAt),
]);

export const catalogueDependencies = sqliteTable("catalogue_dependencies", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().references(() => catalogueItems.id, { onDelete: "restrict" }),
  dependsOnItemId: text("depends_on_item_id").notNull().references(() => catalogueItems.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_catalogue_dependencies_pair").on(table.itemId, table.dependsOnItemId),
  index("idx_catalogue_dependencies_target").on(table.dependsOnItemId),
]);

export const catalogueEvents = sqliteTable("catalogue_events", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().references(() => catalogueItems.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actionCode: text("action_code").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  reasonCode: text("reason_code"),
  itemVersion: integer("item_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_catalogue_events_item_created").on(table.itemId, table.createdAt)]);

export const catalogueRehearsals = sqliteTable("catalogue_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  recordsCreated: integer("records_created").notNull(),
  recordsActivated: integer("records_activated").notNull(),
  recordsRetired: integer("records_retired").notNull(),
  externalRequestsSent: integer("external_requests_sent").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_catalogue_rehearsals_executed").on(table.executedAt)]);

export const catalogueGovernanceSchema = {
  catalogueItems,
  catalogueDependencies,
  catalogueEvents,
  catalogueRehearsals,
};
