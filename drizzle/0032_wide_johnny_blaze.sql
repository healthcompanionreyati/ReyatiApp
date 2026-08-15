CREATE TABLE `observability_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`telemetry_type` text NOT NULL,
	`vendor_alias` text NOT NULL,
	`data_region` text NOT NULL,
	`retention_days` integer NOT NULL,
	`sample_rate_basis_points` integer NOT NULL,
	`primary_owner_user_id` text NOT NULL,
	`backup_owner_user_id` text NOT NULL,
	`sensitive_data_permitted` integer DEFAULT false NOT NULL,
	`external_export_enabled` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`primary_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`backup_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_observability_policies_telemetry_type` ON `observability_policies` (`telemetry_type`);--> statement-breakpoint
CREATE INDEX `idx_observability_policies_status_updated` ON `observability_policies` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_observability_policies_owner_status` ON `observability_policies` (`primary_owner_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `observability_policy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `observability_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_observability_policy_events_policy_created` ON `observability_policy_events` (`policy_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `observability_validation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`initiated_by_user_id` text NOT NULL,
	`fixtures_checked` integer NOT NULL,
	`fixtures_passed` integer NOT NULL,
	`prohibited_fields_detected` integer NOT NULL,
	`external_exported` integer DEFAULT false NOT NULL,
	`mode` text DEFAULT 'local_redaction_test' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `observability_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_observability_validation_runs_policy_created` ON `observability_validation_runs` (`policy_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
