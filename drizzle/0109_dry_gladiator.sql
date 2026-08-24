CREATE TABLE `data_lifecycle_acceptance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`acceptance_run_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`acceptance_run_id`) REFERENCES `data_lifecycle_acceptance_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_data_lifecycle_acceptance_events_run_created` ON `data_lifecycle_acceptance_events` (`acceptance_run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `data_lifecycle_acceptance_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`environment` text DEFAULT 'production' NOT NULL,
	`data_classification` text DEFAULT 'synthetic_only' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`evidence_reference` text NOT NULL,
	`approved_policy_count` integer NOT NULL,
	`approved_retention_plan` integer DEFAULT false NOT NULL,
	`fresh_safety_rehearsal` integer DEFAULT false NOT NULL,
	`safety_scenario_count` integer DEFAULT 0 NOT NULL,
	`overdue_legal_hold_count` integer DEFAULT 0 NOT NULL,
	`protected_storage_configured` integer DEFAULT false NOT NULL,
	`private_scanner_configured` integer DEFAULT false NOT NULL,
	`cleanup_enabled` integer DEFAULT false NOT NULL,
	`scan_recovery_enabled` integer DEFAULT false NOT NULL,
	`scan_dispatch_enabled` integer DEFAULT false NOT NULL,
	`scan_polling_enabled` integer DEFAULT false NOT NULL,
	`retention_execution_enabled` integer DEFAULT false NOT NULL,
	`deletion_processor_enabled` integer DEFAULT false NOT NULL,
	`scheduled_maintenance_observed` integer DEFAULT false NOT NULL,
	`isolated_storage_rehearsal_passed` integer DEFAULT false NOT NULL,
	`customer_records_touched` integer DEFAULT 0 NOT NULL,
	`external_systems_contacted` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_data_lifecycle_acceptance_reference` ON `data_lifecycle_acceptance_runs` (`reference`);--> statement-breakpoint
CREATE INDEX `idx_data_lifecycle_acceptance_status_created` ON `data_lifecycle_acceptance_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_data_lifecycle_acceptance_reviewed` ON `data_lifecycle_acceptance_runs` (`status`,`reviewed_at`);