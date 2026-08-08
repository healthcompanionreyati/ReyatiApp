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
  ...timestamps,
}, (table) => [index("idx_organizations_type_status").on(table.type, table.status)]);

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
  verificationStatus: text("verification_status").notNull().default("pending"),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_provider_profiles_user_id").on(table.userId),
  uniqueIndex("idx_provider_profiles_license_reference").on(table.licenseReference),
  index("idx_provider_profiles_org_status").on(table.organizationId, table.verificationStatus),
]);

export const facilities = sqliteTable("facilities", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  area: text("area"),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [index("idx_facilities_org_status").on(table.organizationId, table.status)]);

export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  facilityId: text("facility_id").references(() => facilities.id, { onDelete: "restrict" }),
  scheduledStart: integer("scheduled_start", { mode: "timestamp_ms" }).notNull(),
  scheduledEnd: integer("scheduled_end", { mode: "timestamp_ms" }).notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull().default("pending"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_appointments_patient_start").on(table.patientId, table.scheduledStart),
  index("idx_appointments_provider_start").on(table.providerId, table.scheduledStart),
  index("idx_appointments_facility_start").on(table.facilityId, table.scheduledStart),
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
