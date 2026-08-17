CREATE TABLE `integration_certificate_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint_hash` text NOT NULL,
	`purpose_code` text NOT NULL,
	`environment_code` text NOT NULL,
	`issuer_class` text NOT NULL,
	`custody_model` text NOT NULL,
	`expiry_band` text NOT NULL,
	`revocation_check_state` text NOT NULL,
	`status` text DEFAULT 'recorded' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integration_certificate_fingerprint_hash` ON `integration_certificate_assets` (`fingerprint_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_certificate_posture` ON `integration_certificate_assets` (`environment_code`,`expiry_band`,`purpose_code`);--> statement-breakpoint
CREATE TABLE `integration_certificate_events` (
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
CREATE INDEX `idx_integration_certificate_events` ON `integration_certificate_events` (`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_certificate_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`certificate_files_stored` integer NOT NULL,
	`private_keys_stored` integer NOT NULL,
	`trust_stores_changed` integer NOT NULL,
	`revocation_calls_made` integer NOT NULL,
	`external_systems_contacted` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_certificate_rehearsal` ON `integration_certificate_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `integration_certificate_renewal_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`certificate_asset_id` text NOT NULL,
	`renewal_reason` text NOT NULL,
	`target_window` text NOT NULL,
	`validation_profile` text NOT NULL,
	`cutover_strategy` text NOT NULL,
	`rollback_evidence` text NOT NULL,
	`partner_readiness` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`certificate_asset_id`) REFERENCES `integration_certificate_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_certificate_renewal_status` ON `integration_certificate_renewal_plans` (`status`,`target_window`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_certificate_renewal_asset` ON `integration_certificate_renewal_plans` (`certificate_asset_id`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
