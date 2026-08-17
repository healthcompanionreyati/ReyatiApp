import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const healthContentArticles = sqliteTable("health_content_articles", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("draft"),
  currentVersionId: text("current_version_id"),
  version: integer("version").notNull().default(1),
  retirementRequestedByUserId: text("retirement_requested_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  retirementReason: text("retirement_reason"),
  retiredAt: integer("retired_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_health_content_articles_slug").on(table.slug),
  index("idx_health_content_articles_status_category_updated").on(table.status, table.category, table.updatedAt),
]);

export const healthContentVersions = sqliteTable("health_content_versions", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => healthContentArticles.id, { onDelete: "restrict" }),
  versionNumber: integer("version_number").notNull(),
  status: text("status").notNull().default("draft"),
  titleEn: text("title_en").notNull(),
  titleAr: text("title_ar").notNull(),
  summaryEn: text("summary_en").notNull(),
  summaryAr: text("summary_ar").notNull(),
  bodyEn: text("body_en").notNull(),
  bodyAr: text("body_ar").notNull(),
  authorName: text("author_name").notNull(),
  authorCredentials: text("author_credentials").notNull(),
  authorUserId: text("author_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  medicalReviewerName: text("medical_reviewer_name"),
  medicalReviewerCredentials: text("medical_reviewer_credentials"),
  medicalReviewerUserId: text("medical_reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  approvedByUserId: text("approved_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  changeSummary: text("change_summary").notNull(),
  reviewNotes: text("review_notes"),
  correctionNoticeEn: text("correction_notice_en"),
  correctionNoticeAr: text("correction_notice_ar"),
  evidenceReviewedThrough: text("evidence_reviewed_through").notNull(),
  nextReviewDueAt: integer("next_review_due_at", { mode: "timestamp_ms" }).notNull(),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_health_content_versions_article_number").on(table.articleId, table.versionNumber),
  index("idx_health_content_versions_article_status_updated").on(table.articleId, table.status, table.updatedAt),
  index("idx_health_content_versions_review_due").on(table.status, table.nextReviewDueAt),
]);

export const healthContentSources = sqliteTable("health_content_sources", {
  id: text("id").primaryKey(),
  versionId: text("version_id").notNull().references(() => healthContentVersions.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  publisher: text("publisher").notNull(),
  url: text("url").notNull(),
  accessedOn: text("accessed_on").notNull(),
  displayOrder: integer("display_order").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_health_content_sources_version_order").on(table.versionId, table.displayOrder)]);

export const healthContentEvents = sqliteTable("health_content_events", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => healthContentArticles.id, { onDelete: "restrict" }),
  versionId: text("version_id").references(() => healthContentVersions.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_health_content_events_article_created").on(table.articleId, table.createdAt)]);

export const healthContentRehearsals = sqliteTable("health_content_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  articlesCreated: integer("articles_created").notNull(),
  articlesPublished: integer("articles_published").notNull(),
  externalRequestsSent: integer("external_requests_sent").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_health_content_rehearsals_executed").on(table.executedAt)]);
