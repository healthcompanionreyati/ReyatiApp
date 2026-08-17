CREATE TABLE `integration_observability_events` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `integration_observability_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_observability_events` ON `integration_observability_events` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_observability_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`signal_reference_hash` text NOT NULL,
	`signal_class` text NOT NULL,
	`coverage_band` text NOT NULL,
	`correlation_profile` text NOT NULL,
	`redaction_state` text NOT NULL,
	`retention_profile` text NOT NULL,
	`alert_ownership` text NOT NULL,
	`threshold_evidence` text NOT NULL,
	`dashboard_evidence` text NOT NULL,
	`runbook_readiness` text NOT NULL,
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
CREATE UNIQUE INDEX `uq_integration_observability_reference` ON `integration_observability_profiles` (`signal_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_observability_posture` ON `integration_observability_profiles` (`signal_class`,`coverage_band`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_observability_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`telemetry_collected` integer NOT NULL,
	`payloads_inspected` integer NOT NULL,
	`exports_started` integer NOT NULL,
	`pages_sent` integer NOT NULL,
	`external_systems_contacted` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_observability_rehearsal` ON `integration_observability_rehearsals` (`executed_at`);--> statement-breakpoint
PRAGMA optimize;
