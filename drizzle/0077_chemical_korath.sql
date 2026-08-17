CREATE TABLE `data_quality_rule_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`metric_code` text NOT NULL,
	`resource_scope` text NOT NULL,
	`threshold_band` text NOT NULL,
	`response_code` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_data_quality_rule_status` ON `data_quality_rule_proposals` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `external_record_connection_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`system_type` text NOT NULL,
	`organization_reference` text NOT NULL,
	`requested_scope` text NOT NULL,
	`consent_acknowledged` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_external_connection_patient_status` ON `external_record_connection_requests` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `interoperability_profile_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_name` text NOT NULL,
	`standard_version` text NOT NULL,
	`resource_scope` text NOT NULL,
	`partner_reference` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_interop_profile_status` ON `interoperability_profile_proposals` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `release_two_readiness_events` (
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
CREATE INDEX `idx_release_two_events_record` ON `release_two_readiness_events` (`module`,`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `release_two_readiness_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`external_connections_made` integer NOT NULL,
	`device_data_imported` integer NOT NULL,
	`profiles_activated` integer NOT NULL,
	`runtime_rules_changed` integer NOT NULL,
	`tenant_themes_applied` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_release_two_rehearsal_executed` ON `release_two_readiness_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `tenant_experience_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_reference` text NOT NULL,
	`experience_name` text NOT NULL,
	`locale_set` text NOT NULL,
	`theme_token_set` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_experience_status` ON `tenant_experience_proposals` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `wearable_connection_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`device_category` text NOT NULL,
	`data_scope` text NOT NULL,
	`purpose_code` text NOT NULL,
	`consent_acknowledged` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_wearable_connection_patient_status` ON `wearable_connection_requests` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
