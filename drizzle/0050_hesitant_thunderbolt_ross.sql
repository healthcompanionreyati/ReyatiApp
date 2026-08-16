CREATE TABLE `medication_reminder_delivery_consent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`consent_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`consent_version` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`consent_id`) REFERENCES `medication_reminder_delivery_consents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_med_reminder_delivery_consent_events_consent_created` ON `medication_reminder_delivery_consent_events` (`consent_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `medication_reminder_delivery_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`consent_version` text NOT NULL,
	`locale` text NOT NULL,
	`status` text DEFAULT 'not_consented' NOT NULL,
	`acknowledged_boundaries_json` text DEFAULT '[]' NOT NULL,
	`consented_at` integer,
	`withdrawn_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_med_reminder_delivery_consents_user` ON `medication_reminder_delivery_consents` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_med_reminder_delivery_consents_status_updated` ON `medication_reminder_delivery_consents` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `medication_reminder_delivery_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`scheduler_run_id` text NOT NULL,
	`suite_version` text NOT NULL,
	`total_scenarios` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`duplicate_deliveries` integer NOT NULL,
	`external_delivery_attempts` integer NOT NULL,
	`patient_records_touched` integer NOT NULL,
	`result` text NOT NULL,
	`failures_json` text DEFAULT '[]' NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `medication_reminder_delivery_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`scheduler_run_id`) REFERENCES `medication_reminder_scheduler_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_med_reminder_delivery_rehearsals_result_executed` ON `medication_reminder_delivery_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE INDEX `idx_med_reminder_delivery_rehearsals_policy_executed` ON `medication_reminder_delivery_rehearsals` (`policy_id`,`executed_at`);--> statement-breakpoint
PRAGMA optimize;
