CREATE TABLE `integration_traffic_control_events` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `integration_traffic_control_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_traffic_events` ON `integration_traffic_control_events` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_traffic_control_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_reference_hash` text NOT NULL,
	`consumer_class` text NOT NULL,
	`endpoint_class` text NOT NULL,
	`request_rate_band` text NOT NULL,
	`burst_band` text NOT NULL,
	`retry_policy` text NOT NULL,
	`circuit_breaker_profile` text NOT NULL,
	`quota_period` text NOT NULL,
	`abuse_response` text NOT NULL,
	`evidence_state` text NOT NULL,
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
CREATE UNIQUE INDEX `uq_integration_traffic_profile_reference` ON `integration_traffic_control_profiles` (`profile_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_traffic_posture` ON `integration_traffic_control_profiles` (`consumer_class`,`endpoint_class`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_traffic_control_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`requests_throttled` integer NOT NULL,
	`clients_blocked` integer NOT NULL,
	`traffic_routes_changed` integer NOT NULL,
	`alerts_sent` integer NOT NULL,
	`external_systems_contacted` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_traffic_rehearsal` ON `integration_traffic_control_rehearsals` (`executed_at`);--> statement-breakpoint
PRAGMA optimize;
