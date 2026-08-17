CREATE TABLE `api_contract_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_reference` text NOT NULL,
	`version_label` text NOT NULL,
	`compatibility_class` text NOT NULL,
	`schema_state` text NOT NULL,
	`consumer_impact_band` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_api_contract_status` ON `api_contract_versions` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `api_deprecation_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_reference` text NOT NULL,
	`contract_reference` text NOT NULL,
	`notice_window_band` text NOT NULL,
	`migration_guide_state` text NOT NULL,
	`sunset_readiness` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_api_deprecation_status` ON `api_deprecation_plans` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `exchange_purpose_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`mapping_reference` text NOT NULL,
	`exchange_family` text NOT NULL,
	`purpose_code` text NOT NULL,
	`consent_requirement` text NOT NULL,
	`minimum_data_band` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_exchange_purpose_status` ON `exchange_purpose_mappings` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_lifecycle_events` (
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
CREATE INDEX `idx_integration_lifecycle_events` ON `integration_lifecycle_events` (`module`,`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_lifecycle_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`contracts_published` integer NOT NULL,
	`traffic_routed` integer NOT NULL,
	`records_deleted` integer NOT NULL,
	`sla_actions_executed` integer NOT NULL,
	`consent_rules_enforced` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_lifecycle_rehearsal` ON `integration_lifecycle_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `integration_retention_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_reference` text NOT NULL,
	`data_class` text NOT NULL,
	`retention_band` text NOT NULL,
	`legal_hold_handling` text NOT NULL,
	`deletion_evidence_state` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_retention_status` ON `integration_retention_policies` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `partner_sla_commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`commitment_reference` text NOT NULL,
	`partner_reference` text NOT NULL,
	`service_class` text NOT NULL,
	`availability_band` text NOT NULL,
	`recovery_band` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_partner_sla_status` ON `partner_sla_commitments` (`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
