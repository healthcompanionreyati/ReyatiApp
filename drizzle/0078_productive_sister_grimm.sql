CREATE TABLE `connection_onboarding_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_reference` text NOT NULL,
	`vendor_reference` text NOT NULL,
	`protocol_code` text NOT NULL,
	`environment_code` text NOT NULL,
	`readiness_band` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_connection_onboarding_status` ON `connection_onboarding_proposals` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `data_migration_rehearsal_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`migration_reference` text NOT NULL,
	`source_class` text NOT NULL,
	`record_band` text NOT NULL,
	`validation_scope` text NOT NULL,
	`rollback_state` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_migration_plan_status` ON `data_migration_rehearsal_plans` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_incident_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_reference` text NOT NULL,
	`connection_reference` text NOT NULL,
	`severity_band` text NOT NULL,
	`symptom_code` text NOT NULL,
	`containment_state` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_incident_status` ON `integration_incident_cases` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_mapping_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`mapping_reference` text NOT NULL,
	`source_resource` text NOT NULL,
	`target_resource` text NOT NULL,
	`terminology_state` text NOT NULL,
	`validation_band` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_mapping_status` ON `integration_mapping_proposals` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_operation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`module` text NOT NULL,
	`record_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_operation_events` ON `integration_operation_events` (`module`,`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_operation_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`vendors_approved` integer NOT NULL,
	`connections_opened` integer NOT NULL,
	`mappings_applied` integer NOT NULL,
	`records_migrated` integer NOT NULL,
	`incidents_auto_closed` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_rehearsal_executed` ON `integration_operation_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `integration_vendor_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_reference` text NOT NULL,
	`vendor_category` text NOT NULL,
	`data_residency_band` text NOT NULL,
	`assurance_state` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_vendor_status` ON `integration_vendor_proposals` (`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
