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
  ...timestamps,
}, (table) => [
  index("idx_document_records_owner_created").on(table.ownerUserId, table.createdAt),
  uniqueIndex("idx_document_records_object_key").on(table.objectKey),
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
