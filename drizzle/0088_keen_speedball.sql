CREATE TABLE `integration_change_events` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `integration_change_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_change_events` ON `integration_change_events` (`proposal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_change_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`change_reference_hash` text NOT NULL,
	`change_class` text NOT NULL,
	`impact_band` text NOT NULL,
	`window_profile` text NOT NULL,
	`validation_plan` text NOT NULL,
	`rollback_readiness` text NOT NULL,
	`partner_readiness` text NOT NULL,
	`communication_state` text NOT NULL,
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
CREATE UNIQUE INDEX `uq_integration_change_reference` ON `integration_change_proposals` (`change_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_change_posture` ON `integration_change_proposals` (`change_class`,`impact_band`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_change_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`deployments_started` integer NOT NULL,
	`configurations_changed` integer NOT NULL,
	`maintenance_windows_opened` integer NOT NULL,
	`notices_sent` integer NOT NULL,
	`external_systems_contacted` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_change_rehearsal` ON `integration_change_rehearsals` (`executed_at`);--> statement-breakpoint
PRAGMA optimize;
