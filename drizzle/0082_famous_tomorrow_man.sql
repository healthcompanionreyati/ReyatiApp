CREATE TABLE `integration_secret_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`secret_reference_hash` text NOT NULL,
	`category` text NOT NULL,
	`environment_code` text NOT NULL,
	`custody_provider` text NOT NULL,
	`owner_role` text NOT NULL,
	`age_band` text NOT NULL,
	`status` text DEFAULT 'recorded' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integration_secret_reference_hash` ON `integration_secret_assets` (`secret_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_secret_posture` ON `integration_secret_assets` (`environment_code`,`category`,`age_band`);--> statement-breakpoint
CREATE TABLE `integration_secret_events` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_secret_events` ON `integration_secret_events` (`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_secret_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`secrets_stored` integer NOT NULL,
	`credentials_issued` integer NOT NULL,
	`credentials_rotated` integer NOT NULL,
	`credentials_revoked` integer NOT NULL,
	`external_systems_contacted` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_secret_rehearsal` ON `integration_secret_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `integration_secret_rotation_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`reason_code` text NOT NULL,
	`target_window_band` text NOT NULL,
	`overlap_strategy` text NOT NULL,
	`rollback_readiness` text NOT NULL,
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
	FOREIGN KEY (`asset_id`) REFERENCES `integration_secret_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_secret_rotation_status` ON `integration_secret_rotation_plans` (`status`,`target_window_band`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_secret_rotation_asset` ON `integration_secret_rotation_plans` (`asset_id`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
