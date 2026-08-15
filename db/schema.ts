import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  authUserId: text("auth_user_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_users_auth_user_id").on(table.authUserId),
  uniqueIndex("idx_users_email").on(table.email),
]);

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  verificationVersion: integer("verification_version").notNull().default(1),
  ...timestamps,
}, (table) => [index("idx_organizations_type_status").on(table.type, table.status)]);

export const organizationVerificationReviews = sqliteTable("organization_verification_reviews", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  reviewerUserId: text("reviewer_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  decision: text("decision").notNull(),
  verificationVersion: integer("verification_version").notNull(),
  notes: text("notes").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_organization_reviews_org_created").on(table.organizationId, table.createdAt),
  index("idx_organization_reviews_reviewer_created").on(table.reviewerUserId, table.createdAt),
  uniqueIndex("idx_organization_reviews_org_version").on(table.organizationId, table.verificationVersion),
]);

export const organizationMembers = sqliteTable("organization_members", {
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.userId] }),
  index("idx_organization_members_user_status").on(table.userId, table.status),
  index("idx_organization_members_org_role").on(table.organizationId, table.role),
]);

export const organizationInvitations = sqliteTable("organization_invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull().default("pending"),
  invitedByUserId: text("invited_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  acceptedByUserId: text("accepted_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_organization_invitations_token_hash").on(table.tokenHash),
  index("idx_organization_invitations_org_status").on(table.organizationId, table.status),
  index("idx_organization_invitations_email_status").on(table.email, table.status),
]);

export const platformRoles = sqliteTable("platform_roles", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [primaryKey({ columns: [table.userId, table.role] }), index("idx_platform_roles_role_status").on(table.role, table.status)]);

export const platformRoleInvitations = sqliteTable("platform_role_invitations", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull().default("pending"),
  invitedByUserId: text("invited_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  acceptedByUserId: text("accepted_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_platform_role_invitations_token_hash").on(table.tokenHash),
  index("idx_platform_role_invitations_email_status").on(table.email, table.status),
  index("idx_platform_role_invitations_role_status").on(table.role, table.status),
]);

export const pilotControlAssignments = sqliteTable("pilot_control_assignments", {
  id: text("id").primaryKey(),
  controlId: text("control_id").notNull(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  backupOwnerUserId: text("backup_owner_user_id").references(() => users.id, { onDelete: "restrict" }),
  responseTargetMinutes: integer("response_target_minutes").notNull(),
  escalationPath: text("escalation_path").notNull(),
  evidenceReference: text("evidence_reference"),
  evidenceStatus: text("evidence_status").notNull().default("draft"),
  lastRehearsedAt: integer("last_rehearsed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_pilot_control_assignments_control").on(table.controlId),
  index("idx_pilot_control_assignments_owner_status").on(table.ownerUserId, table.evidenceStatus),
  index("idx_pilot_control_assignments_evidence_rehearsed").on(table.evidenceStatus, table.lastRehearsedAt),
]);

export const operationalIncidents = sqliteTable("operational_incidents", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("open"),
  source: text("source").notNull().default("manual"),
  declaredByUserId: text("declared_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  assignedToUserId: text("assigned_to_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  responseDueAt: integer("response_due_at", { mode: "timestamp_ms" }).notNull(),
  acknowledgedAt: integer("acknowledged_at", { mode: "timestamp_ms" }),
  containedAt: integer("contained_at", { mode: "timestamp_ms" }),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_operational_incidents_reference").on(table.reference),
  index("idx_operational_incidents_status_severity_updated").on(table.status, table.severity, table.updatedAt),
  index("idx_operational_incidents_assignee_status").on(table.assignedToUserId, table.status),
  index("idx_operational_incidents_response_due").on(table.status, table.responseDueAt),
]);

export const operationalIncidentUpdates = sqliteTable("operational_incident_updates", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => operationalIncidents.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  note: text("note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_operational_incident_updates_incident_created").on(table.incidentId, table.createdAt),
  index("idx_operational_incident_updates_actor_created").on(table.actorUserId, table.createdAt),
]);

export const recoveryRehearsals = sqliteTable("recovery_rehearsals", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  scope: text("scope").notNull(),
  environment: text("environment").notNull().default("isolated_hosted_recovery"),
  dataClassification: text("data_classification").notNull().default("synthetic_only"),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("planned"),
  targetRtoMinutes: integer("target_rto_minutes").notNull(),
  targetRpoMinutes: integer("target_rpo_minutes").notNull(),
  plannedAt: integer("planned_at", { mode: "timestamp_ms" }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  measuredRtoMinutes: integer("measured_rto_minutes"),
  recoveryPointAgeMinutes: integer("recovery_point_age_minutes"),
  integrityStatus: text("integrity_status").notNull().default("pending"),
  evidenceReference: text("evidence_reference"),
  reviewStatus: text("review_status").notNull().default("pending"),
  reviewerUserId: text("reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewNote: text("review_note"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_recovery_rehearsals_reference").on(table.reference),
  index("idx_recovery_rehearsals_status_planned").on(table.status, table.plannedAt),
  index("idx_recovery_rehearsals_review_completed").on(table.reviewStatus, table.completedAt),
  index("idx_recovery_rehearsals_owner_status").on(table.ownerUserId, table.status),
]);

export const recoveryRehearsalEvents = sqliteTable("recovery_rehearsal_events", {
  id: text("id").primaryKey(),
  rehearsalId: text("rehearsal_id").notNull().references(() => recoveryRehearsals.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  note: text("note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_recovery_rehearsal_events_rehearsal_created").on(table.rehearsalId, table.createdAt),
]);

export const dataLifecyclePolicies = sqliteTable("data_lifecycle_policies", {
  id: text("id").primaryKey(),
  recordClass: text("record_class").notNull(),
  retentionMonths: integer("retention_months").notNull(),
  retentionTrigger: text("retention_trigger").notNull(),
  disposition: text("disposition").notNull(),
  legalBasisReference: text("legal_basis_reference").notNull(),
  evidenceReference: text("evidence_reference").notNull(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("draft"),
  reviewerUserId: text("reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewNote: text("review_note"),
  effectiveAt: integer("effective_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_data_lifecycle_policies_record_class").on(table.recordClass),
  index("idx_data_lifecycle_policies_status_updated").on(table.status, table.updatedAt),
  index("idx_data_lifecycle_policies_owner_status").on(table.ownerUserId, table.status),
]);

export const dataLifecyclePolicyEvents = sqliteTable("data_lifecycle_policy_events", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull().references(() => dataLifecyclePolicies.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  note: text("note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_data_lifecycle_policy_events_policy_created").on(table.policyId, table.createdAt)]);

export const legalHoldOrders = sqliteTable("legal_hold_orders", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  recordClass: text("record_class").notNull(),
  scopeType: text("scope_type").notNull(),
  protectedReference: text("protected_reference").notNull(),
  reasonCode: text("reason_code").notNull(),
  authorityReference: text("authority_reference").notNull(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  placedByUserId: text("placed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("active"),
  placedAt: integer("placed_at", { mode: "timestamp_ms" }).notNull(),
  reviewDueAt: integer("review_due_at", { mode: "timestamp_ms" }).notNull(),
  releaseRequestedByUserId: text("release_requested_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  releaseRequestedAt: integer("release_requested_at", { mode: "timestamp_ms" }),
  releasedByUserId: text("released_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  releasedAt: integer("released_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_legal_hold_orders_reference").on(table.reference),
  index("idx_legal_hold_orders_status_review").on(table.status, table.reviewDueAt),
  index("idx_legal_hold_orders_record_scope_status").on(table.recordClass, table.scopeType, table.protectedReference, table.status),
  index("idx_legal_hold_orders_owner_status").on(table.ownerUserId, table.status),
]);

export const legalHoldOrderEvents = sqliteTable("legal_hold_order_events", {
  id: text("id").primaryKey(),
  holdId: text("hold_id").notNull().references(() => legalHoldOrders.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  note: text("note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_legal_hold_order_events_hold_created").on(table.holdId, table.createdAt)]);

export const retentionAutomationPlans = sqliteTable("retention_automation_plans", {
  id: text("id").primaryKey(),
  recordClass: text("record_class").notNull(),
  policyId: text("policy_id").notNull().references(() => dataLifecyclePolicies.id, { onDelete: "restrict" }),
  cadence: text("cadence").notNull(),
  batchLimit: integer("batch_limit").notNull(),
  scheduleReference: text("schedule_reference").notNull(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("draft"),
  reviewerUserId: text("reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewNote: text("review_note"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_retention_automation_plans_record_class").on(table.recordClass),
  index("idx_retention_automation_plans_status_updated").on(table.status, table.updatedAt),
  index("idx_retention_automation_plans_owner_status").on(table.ownerUserId, table.status),
]);

export const retentionPreviewRuns = sqliteTable("retention_preview_runs", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => retentionAutomationPlans.id, { onDelete: "restrict" }),
  requestedByUserId: text("requested_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  policyVersion: integer("policy_version").notNull(),
  candidates: integer("candidates").notNull(),
  excludedByHold: integer("excluded_by_hold").notNull(),
  examined: integer("examined").notNull(),
  mode: text("mode").notNull().default("preview_only"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_retention_preview_runs_plan_created").on(table.planId, table.createdAt)]);

export const retentionAutomationPlanEvents = sqliteTable("retention_automation_plan_events", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => retentionAutomationPlans.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  note: text("note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_retention_automation_plan_events_plan_created").on(table.planId, table.createdAt)]);

export const securityAlertPolicies = sqliteTable("security_alert_policies", {
  id: text("id").primaryKey(),
  signalType: text("signal_type").notNull(),
  minimumSeverity: text("minimum_severity").notNull(),
  responseTargetMinutes: integer("response_target_minutes").notNull(),
  escalationAfterMinutes: integer("escalation_after_minutes").notNull(),
  channelType: text("channel_type").notNull(),
  destinationAlias: text("destination_alias").notNull(),
  primaryOwnerUserId: text("primary_owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  backupOwnerUserId: text("backup_owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("draft"),
  reviewerUserId: text("reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewNote: text("review_note"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_security_alert_policies_signal_type").on(table.signalType),
  index("idx_security_alert_policies_status_updated").on(table.status, table.updatedAt),
  index("idx_security_alert_policies_owner_status").on(table.primaryOwnerUserId, table.status),
]);

export const securityAlertPolicyEvents = sqliteTable("security_alert_policy_events", {
  id: text("id").primaryKey(), policyId: text("policy_id").notNull().references(() => securityAlertPolicies.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(),
  previousStatus: text("previous_status"), nextStatus: text("next_status").notNull(), note: text("note").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_security_alert_policy_events_policy_created").on(table.policyId, table.createdAt)]);

export const securityAlertDrills = sqliteTable("security_alert_drills", {
  id: text("id").primaryKey(), policyId: text("policy_id").notNull().references(() => securityAlertPolicies.id, { onDelete: "restrict" }),
  initiatedByUserId: text("initiated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), severity: text("severity").notNull(),
  inAppDelivered: integer("in_app_delivered", { mode: "boolean" }).notNull().default(true), externalDelivered: integer("external_delivered", { mode: "boolean" }).notNull().default(false),
  primaryNotified: integer("primary_notified", { mode: "boolean" }).notNull().default(true), backupNotified: integer("backup_notified", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_security_alert_drills_policy_created").on(table.policyId, table.createdAt)]);

export const observabilityPolicies = sqliteTable("observability_policies", {
  id: text("id").primaryKey(),
  telemetryType: text("telemetry_type").notNull(),
  vendorAlias: text("vendor_alias").notNull(),
  dataRegion: text("data_region").notNull(),
  retentionDays: integer("retention_days").notNull(),
  sampleRateBasisPoints: integer("sample_rate_basis_points").notNull(),
  primaryOwnerUserId: text("primary_owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  backupOwnerUserId: text("backup_owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  sensitiveDataPermitted: integer("sensitive_data_permitted", { mode: "boolean" }).notNull().default(false),
  externalExportEnabled: integer("external_export_enabled", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("draft"),
  reviewerUserId: text("reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewNote: text("review_note"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_observability_policies_telemetry_type").on(table.telemetryType),
  index("idx_observability_policies_status_updated").on(table.status, table.updatedAt),
  index("idx_observability_policies_owner_status").on(table.primaryOwnerUserId, table.status),
]);

export const observabilityPolicyEvents = sqliteTable("observability_policy_events", {
  id: text("id").primaryKey(), policyId: text("policy_id").notNull().references(() => observabilityPolicies.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(),
  previousStatus: text("previous_status"), nextStatus: text("next_status").notNull(), note: text("note").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_observability_policy_events_policy_created").on(table.policyId, table.createdAt)]);

export const observabilityValidationRuns = sqliteTable("observability_validation_runs", {
  id: text("id").primaryKey(), policyId: text("policy_id").notNull().references(() => observabilityPolicies.id, { onDelete: "restrict" }),
  initiatedByUserId: text("initiated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  fixturesChecked: integer("fixtures_checked").notNull(), fixturesPassed: integer("fixtures_passed").notNull(),
  prohibitedFieldsDetected: integer("prohibited_fields_detected").notNull(), externalExported: integer("external_exported", { mode: "boolean" }).notNull().default(false),
  mode: text("mode").notNull().default("local_redaction_test"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_observability_validation_runs_policy_created").on(table.policyId, table.createdAt)]);

export const pilotReadinessReviews = sqliteTable("pilot_readiness_reviews", {
  id: text("id").primaryKey(),
  cycleLabel: text("cycle_label").notNull(),
  scope: text("scope").notNull().default("controlled_provider_pilot"),
  preparedByUserId: text("prepared_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  snapshotJson: text("snapshot_json").notNull(),
  clearedGateCount: integer("cleared_gate_count").notNull(),
  totalGateCount: integer("total_gate_count").notNull(),
  blockedGateCount: integer("blocked_gate_count").notNull(),
  status: text("status").notNull().default("draft"),
  decision: text("decision").notNull().default("pending"),
  reviewerUserId: text("reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewNote: text("review_note"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_pilot_readiness_reviews_status_updated").on(table.status, table.updatedAt),
  index("idx_pilot_readiness_reviews_preparer_created").on(table.preparedByUserId, table.createdAt),
]);

export const pilotReadinessReviewEvents = sqliteTable("pilot_readiness_review_events", {
  id: text("id").primaryKey(), reviewId: text("review_id").notNull().references(() => pilotReadinessReviews.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(),
  previousStatus: text("previous_status"), nextStatus: text("next_status").notNull(), note: text("note").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_pilot_readiness_review_events_review_created").on(table.reviewId, table.createdAt)]);

export const controlledPilotPlans = sqliteTable("controlled_pilot_plans", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  clinicLabel: text("clinic_label").notNull(),
  plannedStartAt: integer("planned_start_at", { mode: "timestamp_ms" }).notNull(),
  plannedEndAt: integer("planned_end_at", { mode: "timestamp_ms" }).notNull(),
  providerTarget: integer("provider_target").notNull(),
  patientTarget: integer("patient_target").notNull(),
  invitationOnly: integer("invitation_only", { mode: "boolean" }).notNull().default(true),
  publicRegistrationEnabled: integer("public_registration_enabled", { mode: "boolean" }).notNull().default(false),
  preparedByUserId: text("prepared_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("draft"),
  reviewerUserId: text("reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewNote: text("review_note"),
  activatedAt: integer("activated_at", { mode: "timestamp_ms" }),
  readinessReviewId: text("readiness_review_id").references(() => pilotReadinessReviews.id, { onDelete: "restrict" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_controlled_pilot_plans_organization").on(table.organizationId),
  index("idx_controlled_pilot_plans_status_updated").on(table.status, table.updatedAt),
]);

export const controlledPilotPlanEvents = sqliteTable("controlled_pilot_plan_events", {
  id: text("id").primaryKey(), planId: text("plan_id").notNull().references(() => controlledPilotPlans.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(),
  previousStatus: text("previous_status"), nextStatus: text("next_status").notNull(), note: text("note").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_controlled_pilot_plan_events_plan_created").on(table.planId, table.createdAt)]);

export const controlledPilotCohortMembers = sqliteTable("controlled_pilot_cohort_members", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => controlledPilotPlans.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  participantType: text("participant_type").notNull(),
  status: text("status").notNull().default("nominated"),
  nominatedByUserId: text("nominated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  removedAt: integer("removed_at", { mode: "timestamp_ms" }),
  note: text("note").notNull(),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_controlled_pilot_cohort_plan_user").on(table.planId, table.userId),
  index("idx_controlled_pilot_cohort_plan_type_status").on(table.planId, table.participantType, table.status),
]);

export const controlledPilotCohortEvents = sqliteTable("controlled_pilot_cohort_events", {
  id: text("id").primaryKey(), memberId: text("member_id").notNull().references(() => controlledPilotCohortMembers.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(),
  previousStatus: text("previous_status"), nextStatus: text("next_status").notNull(), note: text("note").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_controlled_pilot_cohort_events_member_created").on(table.memberId, table.createdAt)]);

export const pilotEnrollmentDocuments = sqliteTable("pilot_enrollment_documents", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => controlledPilotPlans.id, { onDelete: "restrict" }),
  documentType: text("document_type").notNull(),
  audience: text("audience").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  policyVersion: text("policy_version").notNull(),
  artifactReference: text("artifact_reference").notNull(),
  status: text("status").notNull().default("draft"),
  preparedByUserId: text("prepared_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewerUserId: text("reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewNote: text("review_note"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_pilot_enrollment_document_plan_type_version").on(table.planId, table.documentType, table.policyVersion),
  index("idx_pilot_enrollment_document_plan_status").on(table.planId, table.status),
]);

export const pilotEnrollmentDocumentEvents = sqliteTable("pilot_enrollment_document_events", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => pilotEnrollmentDocuments.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  note: text("note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_pilot_enrollment_document_events_document_created").on(table.documentId, table.createdAt)]);

export const patientProfiles = sqliteTable("patient_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  dateOfBirth: text("date_of_birth"),
  profileStatus: text("profile_status").notNull().default("incomplete"),
  ...timestamps,
}, (table) => [uniqueIndex("idx_patient_profiles_user_id").on(table.userId)]);

export const providerProfiles = sqliteTable("provider_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  licenseReference: text("license_reference").notNull(),
  specialty: text("specialty").notNull(),
  gender: text("gender"),
  languagesJson: text("languages_json").notNull().default("[]"),
  bioEn: text("bio_en"),
  bioAr: text("bio_ar"),
  yearsExperience: integer("years_experience"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  verificationVersion: integer("verification_version").notNull().default(1),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_provider_profiles_user_id").on(table.userId),
  uniqueIndex("idx_provider_profiles_license_reference").on(table.licenseReference),
  index("idx_provider_profiles_org_status").on(table.organizationId, table.verificationStatus),
]);

export const providerVerificationReviews = sqliteTable("provider_verification_reviews", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  reviewerUserId: text("reviewer_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  decision: text("decision").notNull(),
  verificationVersion: integer("verification_version").notNull(),
  notes: text("notes").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_provider_verification_reviews_provider_created").on(table.providerId, table.createdAt),
  index("idx_provider_verification_reviews_reviewer_created").on(table.reviewerUserId, table.createdAt),
  uniqueIndex("idx_provider_verification_reviews_provider_version").on(table.providerId, table.verificationVersion),
]);

export const facilities = sqliteTable("facilities", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  area: text("area"),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [index("idx_facilities_org_status").on(table.organizationId, table.status)]);

export const providerServiceLocations = sqliteTable("provider_service_locations", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "cascade" }),
  facilityId: text("facility_id").references(() => facilities.id, { onDelete: "restrict" }),
  mode: text("mode").notNull(),
  feeQar: integer("fee_qar").notNull(),
  slotDurationMinutes: integer("slot_duration_minutes").notNull().default(30),
  acceptingNewPatients: integer("accepting_new_patients", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [
  index("idx_provider_service_locations_provider_status").on(table.providerId, table.status),
  index("idx_provider_service_locations_facility_status").on(table.facilityId, table.status),
]);

export const providerAvailabilityWindows = sqliteTable("provider_availability_windows", {
  id: text("id").primaryKey(),
  serviceLocationId: text("service_location_id").notNull().references(() => providerServiceLocations.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  timezone: text("timezone").notNull().default("Asia/Qatar"),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [
  index("idx_provider_availability_service_day_status").on(table.serviceLocationId, table.weekday, table.status),
]);

export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  serviceLocationId: text("service_location_id").references(() => providerServiceLocations.id, { onDelete: "restrict" }),
  facilityId: text("facility_id").references(() => facilities.id, { onDelete: "restrict" }),
  scheduledStart: integer("scheduled_start", { mode: "timestamp_ms" }).notNull(),
  scheduledEnd: integer("scheduled_end", { mode: "timestamp_ms" }).notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull().default("pending"),
  cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
  idempotencyKey: text("idempotency_key"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_appointments_patient_start").on(table.patientId, table.scheduledStart),
  index("idx_appointments_provider_start").on(table.providerId, table.scheduledStart),
  index("idx_appointments_service_start").on(table.serviceLocationId, table.scheduledStart),
  uniqueIndex("idx_appointments_patient_idempotency").on(table.patientId, table.idempotencyKey),
  index("idx_appointments_facility_start").on(table.facilityId, table.scheduledStart),
]);

export const careContinuityCases = sqliteTable("care_continuity_cases", {
  id: text("id").primaryKey(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  assignedToUserId: text("assigned_to_user_id").references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("needs_review"),
  resolutionNote: text("resolution_note"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_care_continuity_appointment").on(table.appointmentId),
  index("idx_care_continuity_status_updated").on(table.status, table.updatedAt),
  index("idx_care_continuity_org_status").on(table.organizationId, table.status),
]);

export const appointmentSlotLocks = sqliteTable("appointment_slot_locks", {
  id: text("id").primaryKey(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  slotStart: integer("slot_start", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_appointment_slot_locks_patient_slot").on(table.patientId, table.slotStart),
  uniqueIndex("idx_appointment_slot_locks_provider_slot").on(table.providerId, table.slotStart),
  index("idx_appointment_slot_locks_appointment").on(table.appointmentId),
]);

export const encounterNotes = sqliteTable("encounter_notes", {
  id: text("id").primaryKey(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  authorUserId: text("author_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("draft"),
  historyText: text("history_text").notNull().default(""),
  assessmentText: text("assessment_text").notNull().default(""),
  planText: text("plan_text").notNull().default(""),
  patientInstructions: text("patient_instructions").notNull().default(""),
  version: integer("version").notNull().default(1),
  finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_encounter_notes_appointment").on(table.appointmentId),
  index("idx_encounter_notes_author_status").on(table.authorUserId, table.status),
]);

export const paymentLedgerEntries = sqliteTable("payment_ledger_entries", {
  id: text("id").primaryKey(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  amountQar: integer("amount_qar").notNull(),
  currency: text("currency").notNull().default("QAR"),
  status: text("status").notNull().default("not_charged"),
  providerReference: text("provider_reference"),
  refundAmountQar: integer("refund_amount_qar"),
  statusUpdatedAt: integer("status_updated_at", { mode: "timestamp_ms" }).notNull(),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_payment_ledger_appointment").on(table.appointmentId),
  index("idx_payment_ledger_patient_status_updated").on(table.patientId, table.status, table.statusUpdatedAt),
  index("idx_payment_ledger_status_updated").on(table.status, table.statusUpdatedAt),
  uniqueIndex("idx_payment_ledger_provider_reference").on(table.providerReference),
]);

export const careRelationships = sqliteTable("care_relationships", {
  id: text("id").primaryKey(),
  managerUserId: text("manager_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  subjectUserId: text("subject_user_id").references(() => users.id, { onDelete: "restrict" }),
  subjectLabel: text("subject_label").notNull(),
  relationshipType: text("relationship_type").notNull(),
  status: text("status").notNull(),
  appointmentsAccess: integer("appointments_access", { mode: "boolean" }).notNull().default(false),
  recordsAccess: integer("records_access", { mode: "boolean" }).notNull().default(false),
  paymentsAccess: integer("payments_access", { mode: "boolean" }).notNull().default(false),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_care_relationships_manager_status").on(table.managerUserId, table.status),
  index("idx_care_relationships_subject_status").on(table.subjectUserId, table.status),
]);

export const careRelationshipInvitations = sqliteTable("care_relationship_invitations", {
  id: text("id").primaryKey(),
  relationshipId: text("relationship_id").notNull().references(() => careRelationships.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull().default("pending"),
  invitedByUserId: text("invited_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  acceptedByUserId: text("accepted_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_care_relationship_invitations_token").on(table.tokenHash),
  uniqueIndex("idx_care_relationship_invitations_relationship").on(table.relationshipId),
  index("idx_care_relationship_invitations_email_status").on(table.email, table.status),
]);

export const consents = sqliteTable("consents", {
  id: text("id").primaryKey(),
  subjectUserId: text("subject_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  granteeOrganizationId: text("grantee_organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  scope: text("scope").notNull(),
  purpose: text("purpose").notNull(),
  status: text("status").notNull().default("active"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  index("idx_consents_subject_status").on(table.subjectUserId, table.status),
  index("idx_consents_grantee_status").on(table.granteeOrganizationId, table.status),
]);

export const documentRecords = sqliteTable("document_records", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  sourceOrganizationId: text("source_organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  objectKey: text("object_key").notNull(),
  category: text("category").notNull(),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  status: text("status").notNull().default("upload_pending"),
  pageCount: integer("page_count"),
  capturedAt: integer("captured_at", { mode: "timestamp_ms" }),
  malwareScanStatus: text("malware_scan_status").notNull().default("pending"),
  quarantineReasonCode: text("quarantine_reason_code"),
  retentionState: text("retention_state").notNull().default("active"),
  deletionEligibleAt: integer("deletion_eligible_at", { mode: "timestamp_ms" }),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_document_records_owner_status_created").on(table.ownerUserId, table.status, table.createdAt),
  index("idx_document_records_status_updated").on(table.status, table.updatedAt),
  uniqueIndex("idx_document_records_object_key").on(table.objectKey),
]);

export const documentShares = sqliteTable("document_shares", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => documentRecords.id, { onDelete: "restrict" }),
  consentId: text("consent_id").notNull().references(() => consents.id, { onDelete: "restrict" }),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  recipientProviderId: text("recipient_provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  purpose: text("purpose").notNull(),
  status: text("status").notNull().default("active"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_document_shares_owner_status").on(table.ownerUserId, table.status, table.expiresAt),
  index("idx_document_shares_provider_status").on(table.recipientProviderId, table.status, table.expiresAt),
  index("idx_document_shares_document_status").on(table.documentId, table.status),
]);

export const documentUploadSessions = sqliteTable("document_upload_sessions", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  documentId: text("document_id").references(() => documentRecords.id, { onDelete: "restrict" }),
  objectKey: text("object_key").notNull(),
  category: text("category").notNull().default("other"),
  expectedContentType: text("expected_content_type").notNull(),
  expectedSizeBytes: integer("expected_size_bytes").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("created"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_document_upload_sessions_object_key").on(table.objectKey),
  uniqueIndex("idx_document_upload_sessions_owner_idempotency").on(table.ownerUserId, table.idempotencyKey),
  index("idx_document_upload_sessions_owner_status").on(table.ownerUserId, table.status, table.expiresAt),
]);

export const documentProcessingEvents = sqliteTable("document_processing_events", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => documentRecords.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  providerReference: text("provider_reference"),
  reasonCode: text("reason_code"),
  dedupeKey: text("dedupe_key").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_document_processing_events_dedupe").on(table.dedupeKey),
  index("idx_document_processing_events_document_occurred").on(table.documentId, table.occurredAt),
]);

export const documentAccessGrants = sqliteTable("document_access_grants", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => documentRecords.id, { onDelete: "restrict" }),
  shareId: text("share_id").references(() => documentShares.id, { onDelete: "restrict" }),
  requesterUserId: text("requester_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull(),
  purpose: text("purpose").notNull(),
  status: text("status").notNull().default("active"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_document_access_grants_token_hash").on(table.tokenHash),
  index("idx_document_access_grants_requester_status").on(table.requesterUserId, table.status, table.expiresAt),
  index("idx_document_access_grants_document_status").on(table.documentId, table.status, table.expiresAt),
]);

export const documentDeletionJobs = sqliteTable("document_deletion_jobs", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => documentRecords.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("pending"),
  legalHold: integer("legal_hold", { mode: "boolean" }).notNull().default(false),
  attemptCount: integer("attempt_count").notNull().default(0),
  leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
  lastErrorCode: text("last_error_code"),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_document_deletion_jobs_document").on(table.documentId),
  index("idx_document_deletion_jobs_status_lease").on(table.status, table.leaseExpiresAt),
]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  outcome: text("outcome").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_audit_events_resource_created").on(table.resourceType, table.resourceId, table.createdAt),
  index("idx_audit_events_actor_created").on(table.actorUserId, table.createdAt),
  index("idx_audit_events_org_created").on(table.organizationId, table.createdAt),
]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  actionPath: text("action_path"),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").notNull().default("unread"),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_notifications_user_status_created").on(table.userId, table.status, table.createdAt),
  index("idx_notifications_user_created").on(table.userId, table.createdAt),
  uniqueIndex("idx_notifications_user_dedupe").on(table.userId, table.dedupeKey),
]);

export const supportCases = sqliteTable("support_cases", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  requesterUserId: text("requester_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  assignedToUserId: text("assigned_to_user_id").references(() => users.id, { onDelete: "restrict" }),
  category: text("category").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  relatedReference: text("related_reference"),
  privacyRequestType: text("privacy_request_type"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_support_cases_reference").on(table.reference),
  index("idx_support_cases_requester_updated").on(table.requesterUserId, table.updatedAt),
  index("idx_support_cases_status_priority_updated").on(table.status, table.priority, table.updatedAt),
  index("idx_support_cases_assignee_status").on(table.assignedToUserId, table.status),
]);

export const supportCaseMessages = sqliteTable("support_case_messages", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => supportCases.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  authorKind: text("author_kind").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_support_case_messages_case_created").on(table.caseId, table.createdAt)]);

// Phase 1A foundations are expand-only and are not used by the current login or notification flows.
export const authIdentities = sqliteTable("auth_identities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerSubject: text("provider_subject").notNull(),
  status: text("status").notNull().default("active"),
  linkedAt: integer("linked_at", { mode: "timestamp_ms" }).notNull(),
  lastAuthenticatedAt: integer("last_authenticated_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_auth_identities_provider_subject").on(table.provider, table.providerSubject),
  index("idx_auth_identities_user_status").on(table.userId, table.status),
]);

export const contactMethods = sqliteTable("contact_methods", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  normalizedValue: text("normalized_value").notNull(),
  displayValue: text("display_value").notNull(),
  status: text("status").notNull().default("unverified"),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_contact_methods_kind_value").on(table.kind, table.normalizedValue),
  index("idx_contact_methods_user_status").on(table.userId, table.status),
]);

export const contactVerificationChallenges = sqliteTable("contact_verification_challenges", {
  id: text("id").primaryKey(),
  contactMethodId: text("contact_method_id").notNull().references(() => contactMethods.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  index("idx_contact_verification_contact_status_created").on(table.contactMethodId, table.status, table.createdAt),
  index("idx_contact_verification_status_expires").on(table.status, table.expiresAt),
]);

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  assuranceLevel: text("assurance_level").notNull().default("aal1"),
  status: text("status").notNull().default("active"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_auth_sessions_token_hash").on(table.tokenHash),
  index("idx_auth_sessions_user_status_expires").on(table.userId, table.status, table.expiresAt),
]);

export const authFactors = sqliteTable("auth_factors", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  credentialReference: text("credential_reference"),
  enrolledAt: integer("enrolled_at", { mode: "timestamp_ms" }).notNull(),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [index("idx_auth_factors_user_status").on(table.userId, table.status)]);

export const authEvents = sqliteTable("auth_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  outcome: text("outcome").notNull(),
  channel: text("channel").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_auth_events_user_created").on(table.userId, table.createdAt),
  index("idx_auth_events_type_created").on(table.eventType, table.createdAt),
]);

export const notificationPreferences = sqliteTable("notification_preferences", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  locale: text("locale").notNull().default("en"),
  ...timestamps,
}, (table) => [primaryKey({ columns: [table.userId, table.channel] })]);

export const outboundMessages = sqliteTable("outbound_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  recipientContactMethodId: text("recipient_contact_method_id").references(() => contactMethods.id, { onDelete: "restrict" }),
  recipientAddress: text("recipient_address"),
  channel: text("channel").notNull(),
  templateId: text("template_id").notNull(),
  templateVersion: integer("template_version").notNull(),
  templateDataJson: text("template_data_json").notNull().default("{}"),
  locale: text("locale").notNull().default("en"),
  contentClassification: text("content_classification").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
  lastErrorCode: text("last_error_code"),
  providerMessageId: text("provider_message_id"),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_outbound_messages_dedupe").on(table.dedupeKey),
  uniqueIndex("idx_outbound_messages_provider_message").on(table.providerMessageId),
  index("idx_outbound_messages_status_next_attempt").on(table.status, table.nextAttemptAt),
  index("idx_outbound_messages_user_created").on(table.userId, table.createdAt),
]);

export const messageDeliveryEvents = sqliteTable("message_delivery_events", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => outboundMessages.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id"),
  eventType: text("event_type").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_message_delivery_provider_event").on(table.provider, table.providerEventId),
  index("idx_message_delivery_message_occurred").on(table.messageId, table.occurredAt),
]);

export const webhookReceipts = sqliteTable("webhook_receipts", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  payloadHash: text("payload_hash").notNull(),
  status: text("status").notNull().default("received"),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
}, (table) => [uniqueIndex("idx_webhook_receipts_provider_event").on(table.provider, table.providerEventId)]);

export const emailDeliverySuppressions = sqliteTable("email_delivery_suppressions", {
  addressHash: text("address_hash").primaryKey(),
  reason: text("reason").notNull(),
  sourceProvider: text("source_provider").notNull(),
  sourceMessageId: text("source_message_id"),
  ...timestamps,
});

export const operationalRateLimits = sqliteTable("operational_rate_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  scope: text("scope").notNull(),
  requestCount: integer("request_count").notNull().default(1),
  requestLimit: integer("request_limit").notNull(),
  windowStartedAt: integer("window_started_at", { mode: "timestamp_ms" }).notNull(),
  windowEndsAt: integer("window_ends_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
}, (table) => [
  index("idx_operational_rate_limits_window_end").on(table.windowEndsAt),
  index("idx_operational_rate_limits_scope_updated").on(table.scope, table.updatedAt),
]);
