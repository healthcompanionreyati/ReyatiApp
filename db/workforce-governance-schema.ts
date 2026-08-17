import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { facilities, organizations, users } from "./schema";

export const workforceCredentialRecords = sqliteTable("workforce_credential_records", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),
  staffReference:text("staff_reference").notNull(), workforceCategory:text("workforce_category").notNull(), authorityName:text("authority_name").notNull(), credentialReference:text("credential_reference").notNull(),
  scopeLabel:text("scope_label").notNull(), evidenceReferencesJson:text("evidence_references_json").notNull().default("[]"), issuedAt:integer("issued_at",{mode:"timestamp_ms"}).notNull(), expiresAt:integer("expires_at",{mode:"timestamp_ms"}).notNull(),
  priorRecordId:text("prior_record_id"), status:text("status").notNull().default("draft"), preparedByUserId:text("prepared_by_user_id").notNull().references(()=>users.id,{onDelete:"restrict"}), reviewedByUserId:text("reviewed_by_user_id").references(()=>users.id,{onDelete:"restrict"}), reviewReasonCode:text("review_reason_code"),
  affectedPrivilegeCount:integer("affected_privilege_count").notNull().default(0), impactPreviewedAt:integer("impact_previewed_at",{mode:"timestamp_ms"}), version:integer("version").notNull().default(1), createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull(), updatedAt:integer("updated_at",{mode:"timestamp_ms"}).notNull(),
},t=>[index("idx_workforce_credentials_org_status").on(t.organizationId,t.status,t.updatedAt),index("idx_workforce_credentials_expiry").on(t.status,t.expiresAt),index("idx_workforce_credentials_staff").on(t.organizationId,t.staffReference)]);

export const clinicalPrivilegeProposals = sqliteTable("clinical_privilege_proposals", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}), workforceCredentialId:text("workforce_credential_id").notNull().references(()=>workforceCredentialRecords.id,{onDelete:"restrict"}),
  facilityId:text("facility_id").references(()=>facilities.id,{onDelete:"restrict"}), privilegeCode:text("privilege_code").notNull(), serviceScopeJson:text("service_scope_json").notNull().default("[]"), supervisionLevel:text("supervision_level").notNull(),
  effectiveFrom:integer("effective_from",{mode:"timestamp_ms"}).notNull(), effectiveTo:integer("effective_to",{mode:"timestamp_ms"}).notNull(), status:text("status").notNull().default("draft"),
  preparedByUserId:text("prepared_by_user_id").notNull().references(()=>users.id,{onDelete:"restrict"}), reviewedByUserId:text("reviewed_by_user_id").references(()=>users.id,{onDelete:"restrict"}), reviewReasonCode:text("review_reason_code"),
  version:integer("version").notNull().default(1), createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull(), updatedAt:integer("updated_at",{mode:"timestamp_ms"}).notNull(),
},t=>[index("idx_clinical_privileges_org_status").on(t.organizationId,t.status,t.updatedAt),index("idx_clinical_privileges_credential").on(t.workforceCredentialId,t.status),index("idx_clinical_privileges_effective").on(t.effectiveFrom,t.effectiveTo)]);

export const workforceGovernanceEvents = sqliteTable("workforce_governance_events", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}), resourceType:text("resource_type").notNull(), resourceId:text("resource_id").notNull(), actorUserId:text("actor_user_id").notNull().references(()=>users.id,{onDelete:"restrict"}), eventCode:text("event_code").notNull(), previousStatus:text("previous_status"), nextStatus:text("next_status"), reasonCode:text("reason_code"), resourceVersion:integer("resource_version").notNull(), createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull(),
},t=>[index("idx_workforce_events_resource_created").on(t.resourceType,t.resourceId,t.createdAt)]);

export const workforceGovernanceRehearsals = sqliteTable("workforce_governance_rehearsals", {
  id:text("id").primaryKey(), suiteVersion:text("suite_version").notNull(), scenarioCount:integer("scenario_count").notNull(), passedScenarios:integer("passed_scenarios").notNull(), runtimeCredentialChanges:integer("runtime_credential_changes").notNull(), runtimePrivilegeChanges:integer("runtime_privilege_changes").notNull(), externalRequestsSent:integer("external_requests_sent").notNull(), result:text("result").notNull(), dataMode:text("data_mode").notNull().default("synthetic_only"), executedByUserId:text("executed_by_user_id").notNull().references(()=>users.id,{onDelete:"restrict"}), executedAt:integer("executed_at",{mode:"timestamp_ms"}).notNull(),
},t=>[index("idx_workforce_rehearsals_executed").on(t.executedAt)]);

export const workforceGovernanceSchema={workforceCredentialRecords,clinicalPrivilegeProposals,workforceGovernanceEvents,workforceGovernanceRehearsals};
