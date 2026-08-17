CREATE TABLE `integration_network_boundary_events` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `integration_network_boundary_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_network_events` ON `integration_network_boundary_events` (`proposal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_network_boundary_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`boundary_reference_hash` text NOT NULL,
	`direction_code` text NOT NULL,
	`environment_code` text NOT NULL,
	`transport_profile` text NOT NULL,
	`source_class` text NOT NULL,
	`destination_class` text NOT NULL,
	`purpose_code` text NOT NULL,
	`access_window` text NOT NULL,
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
CREATE UNIQUE INDEX `uq_integration_network_boundary_reference` ON `integration_network_boundary_proposals` (`boundary_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_network_posture` ON `integration_network_boundary_proposals` (`environment_code`,`direction_code`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_network_boundary_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`firewall_rules_changed` integer NOT NULL,
	`routes_changed` integer NOT NULL,
	`dns_records_changed` integer NOT NULL,
	`tunnels_created` integer NOT NULL,
	`external_systems_contacted` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_network_rehearsal` ON `integration_network_boundary_rehearsals` (`executed_at`);--> statement-breakpoint
PRAGMA optimize;
