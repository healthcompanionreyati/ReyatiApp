CREATE TABLE `integration_residency_events` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `integration_residency_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_residency_events` ON `integration_residency_events` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_residency_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`flow_reference_hash` text NOT NULL,
	`data_class` text NOT NULL,
	`residency_zone` text NOT NULL,
	`transfer_basis` text NOT NULL,
	`processor_evidence` text NOT NULL,
	`encryption_posture` text NOT NULL,
	`minimization_state` text NOT NULL,
	`retention_alignment` text NOT NULL,
	`legal_review` text NOT NULL,
	`exit_readiness` text NOT NULL,
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
CREATE UNIQUE INDEX `uq_integration_residency_reference` ON `integration_residency_profiles` (`flow_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_residency_posture` ON `integration_residency_profiles` (`data_class`,`residency_zone`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_residency_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`data_exports_started` integer NOT NULL,
	`cross_border_transfers_started` integer NOT NULL,
	`payloads_inspected` integer NOT NULL,
	`storage_locations_changed` integer NOT NULL,
	`external_processors_contacted` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_residency_rehearsal` ON `integration_residency_rehearsals` (`executed_at`);--> statement-breakpoint
PRAGMA optimize;
