import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { appointments, providerProfiles, users } from "./schema";

const timestamps = { createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull() };

export const patientReviews = sqliteTable("patient_reviews", {
  id: text("id").primaryKey(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  patientUserId: text("patient_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  overallRating: integer("overall_rating").notNull(), communicationRating: integer("communication_rating").notNull(),
  timelinessRating: integer("timeliness_rating").notNull(), clarityRating: integer("clarity_rating").notNull(),
  wouldRecommend: integer("would_recommend", { mode: "boolean" }).notNull(), reviewText: text("review_text").notNull().default(""), locale: text("locale").notNull().default("en"),
  status: text("status").notNull().default("pending_review"), currentReasonCode: text("current_reason_code"),
  contentVersion: integer("content_version").notNull().default(1), moderationVersion: integer("moderation_version").notNull().default(1),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(), publishedAt: integer("published_at", { mode: "timestamp_ms" }), withdrawnAt: integer("withdrawn_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_patient_reviews_one_per_appointment").on(table.appointmentId),
  index("idx_patient_reviews_patient_created").on(table.patientUserId, table.createdAt),
  index("idx_patient_reviews_provider_status_published").on(table.providerId, table.status, table.publishedAt),
  index("idx_patient_reviews_status_updated").on(table.status, table.updatedAt),
]);

export const patientReviewRevisions = sqliteTable("patient_review_revisions", {
  id: text("id").primaryKey(), reviewId: text("review_id").notNull().references(() => patientReviews.id, { onDelete: "restrict" }),
  version: integer("version").notNull(), actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(),
  ratingsJson: text("ratings_json").notNull(), reviewText: text("review_text").notNull(), locale: text("locale").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("idx_patient_review_revisions_review_version").on(table.reviewId, table.version), index("idx_patient_review_revisions_review_created").on(table.reviewId, table.createdAt)]);

export const patientReviewModerationEvents = sqliteTable("patient_review_moderation_events", {
  id: text("id").primaryKey(), reviewId: text("review_id").notNull().references(() => patientReviews.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(), reasonCode: text("reason_code").notNull(), note: text("note").notNull(),
  previousStatus: text("previous_status").notNull(), nextStatus: text("next_status").notNull(), reviewVersion: integer("review_version").notNull(), moderationVersion: integer("moderation_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_patient_review_moderation_review_created").on(table.reviewId, table.createdAt), index("idx_patient_review_moderation_action_created").on(table.action, table.createdAt)]);

export const patientReviewAppeals = sqliteTable("patient_review_appeals", {
  id: text("id").primaryKey(), reviewId: text("review_id").notNull().references(() => patientReviews.id, { onDelete: "restrict" }),
  appellantUserId: text("appellant_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), reasonCode: text("reason_code").notNull(), statement: text("statement").notNull(),
  status: text("status").notNull().default("pending"), resolutionNote: text("resolution_note"), resolvedByUserId: text("resolved_by_user_id").references(() => users.id, { onDelete: "restrict" }), resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1), ...timestamps,
}, (table) => [index("idx_patient_review_appeals_status_created").on(table.status, table.createdAt), index("idx_patient_review_appeals_review_created").on(table.reviewId, table.createdAt)]);

export const patientReviewRehearsals = sqliteTable("patient_review_rehearsals", {
  id: text("id").primaryKey(), suiteVersion: text("suite_version").notNull(), scenarioCount: integer("scenario_count").notNull(), passedScenarios: integer("passed_scenarios").notNull(), failedScenarios: integer("failed_scenarios").notNull(),
  reviewsCreated: integer("reviews_created").notNull(), moderationDecisionsCreated: integer("moderation_decisions_created").notNull(), notificationsSent: integer("notifications_sent").notNull(), publicRecordsChanged: integer("public_records_changed").notNull(),
  result: text("result").notNull(), dataMode: text("data_mode").notNull().default("synthetic_only"), executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_patient_review_rehearsals_result_executed").on(table.result, table.executedAt)]);

export const patientReviewsSchema = { patientReviews, patientReviewRevisions, patientReviewModerationEvents, patientReviewAppeals, patientReviewRehearsals };
