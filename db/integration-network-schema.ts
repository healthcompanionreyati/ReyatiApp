import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const integrationNetworkBoundaryProposals = sqliteTable("integration_network_boundary_proposals", {
  id:text("id").primaryKey(), boundaryReferenceHash:text("boundary_reference_hash").notNull(), directionCode:text("direction_code").notNull(), environmentCode:text("environment_code").notNull(),
  transportProfile:text("transport_profile").notNull(), sourceClass:text("source_class").notNull(), destinationClass:text("destination_class").notNull(), purposeCode:text("purpose_code").notNull(),
  accessWindow:text("access_window").notNull(), evidenceState:text("evidence_state").notNull(), status:text("status").notNull().default("draft"), version:integer("version").notNull().default(1),
  createdByUserId:text("created_by_user_id").notNull().references(()=>users.id,{onDelete:"restrict"}), reviewedByUserId:text("reviewed_by_user_id").references(()=>users.id,{onDelete:"restrict"}),
  decisionCode:text("decision_code"), submittedAt:integer("submitted_at",{mode:"timestamp_ms"}), reviewedAt:integer("reviewed_at",{mode:"timestamp_ms"}),
  createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull(), updatedAt:integer("updated_at",{mode:"timestamp_ms"}).notNull(),
},t=>[uniqueIndex("uq_integration_network_boundary_reference").on(t.boundaryReferenceHash),index("idx_integration_network_posture").on(t.environmentCode,t.directionCode,t.status,t.updatedAt)]);

export const integrationNetworkBoundaryEvents=sqliteTable("integration_network_boundary_events",{
  id:text("id").primaryKey(),proposalId:text("proposal_id").notNull().references(()=>integrationNetworkBoundaryProposals.id,{onDelete:"restrict"}),
  actorUserId:text("actor_user_id").notNull().references(()=>users.id,{onDelete:"restrict"}),action:text("action").notNull(),nextStatus:text("next_status").notNull(),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull(),
},t=>[index("idx_integration_network_events").on(t.proposalId,t.createdAt)]);

export const integrationNetworkBoundaryRehearsals=sqliteTable("integration_network_boundary_rehearsals",{
  id:text("id").primaryKey(),suiteVersion:text("suite_version").notNull(),scenarioCount:integer("scenario_count").notNull(),passedScenarios:integer("passed_scenarios").notNull(),
  firewallRulesChanged:integer("firewall_rules_changed").notNull(),routesChanged:integer("routes_changed").notNull(),dnsRecordsChanged:integer("dns_records_changed").notNull(),
  tunnelsCreated:integer("tunnels_created").notNull(),externalSystemsContacted:integer("external_systems_contacted").notNull(),result:text("result").notNull(),
  executedByUserId:text("executed_by_user_id").notNull().references(()=>users.id,{onDelete:"restrict"}),executedAt:integer("executed_at",{mode:"timestamp_ms"}).notNull(),
},t=>[index("idx_integration_network_rehearsal").on(t.executedAt)]);

export const integrationNetworkSchema={integrationNetworkBoundaryProposals,integrationNetworkBoundaryEvents,integrationNetworkBoundaryRehearsals};
