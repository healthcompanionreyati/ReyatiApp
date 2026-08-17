import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const releaseControlProposals = sqliteTable("release_control_proposals", {
  id: text("id").primaryKey(),
  capabilityId: text("capability_id").notNull(),
  targetEnvironment: text("target_environment").notNull(),
  proposedState: integer("proposed_state", { mode: "boolean" }).notNull(),
  owner: text("owner").notNull(),
  rationale: text("rationale").notNull(),
  rollbackPlan: text("rollback_plan").notNull(),
  changeWindowStartsAt: integer("change_window_starts_at", { mode: "timestamp_ms" }).notNull(),
  changeWindowEndsAt: integer("change_window_ends_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull().default("draft"),
  preparedByUserId: text("prepared_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewReasonCode: text("review_reason_code"),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_release_control_proposals_status_updated").on(table.status, table.updatedAt),
  index("idx_release_control_proposals_capability_environment").on(table.capabilityId, table.targetEnvironment),
  index("idx_release_control_proposals_expiry").on(table.expiresAt),
]);

/** Append-only evidence. The service intentionally exposes no update or delete operation. */
export const releaseControlEvidence = sqliteTable("release_control_evidence", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id").references(() => releaseControlProposals.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  eventCode: text("event_code").notNull(),
  proposalVersion: integer("proposal_version"),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status"),
  reasonCode: text("reason_code"),
  evidenceJson: text("evidence_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_release_control_evidence_proposal_created").on(table.proposalId, table.createdAt),
  index("idx_release_control_evidence_event_created").on(table.eventCode, table.createdAt),
]);

export const releaseControlsSchema = { releaseControlProposals, releaseControlEvidence };
