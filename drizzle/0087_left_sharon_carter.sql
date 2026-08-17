CREATE TABLE `integration_resilience_events` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `integration_resilience_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_resilience_events` ON `integration_resilience_events` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_resilience_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`dependency_reference_hash` text NOT NULL,
	`dependency_class` text NOT NULL,
	`criticality_band` text NOT NULL,
	`health_signal_profile` text NOT NULL,
	`timeout_band` text NOT NULL,
	`failure_threshold` text NOT NULL,
	`fallback_mode` text NOT NULL,
	`recovery_objective` text NOT NULL,
	`recovery_evidence` text NOT NULL,
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
CREATE UNIQUE INDEX `uq_integration_resilience_dependency_reference` ON `integration_resilience_profiles` (`dependency_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_resilience_posture` ON `integration_resilience_profiles` (`criticality_band`,`dependency_class`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_resilience_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`health_probes_sent` integer NOT NULL,
	`traffic_rerouted` integer NOT NULL,
	`failovers_triggered` integer NOT NULL,
	`responders_paged` integer NOT NULL,
	`external_systems_contacted` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_resilience_rehearsal` ON `integration_resilience_rehearsals` (`executed_at`);--> statement-breakpoint
PRAGMA optimize;
