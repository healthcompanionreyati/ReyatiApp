CREATE TABLE `medication_reminder_scheduler_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_id` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`total_scenarios` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`duplicate_occurrences` integer NOT NULL,
	`invalid_source_occurrences` integer NOT NULL,
	`delivery_attempts` integer NOT NULL,
	`result` text NOT NULL,
	`failures_json` text DEFAULT '[]' NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`suite_id`) REFERENCES `medication_reminder_scheduler_suites`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_med_reminder_scheduler_runs_suite_executed` ON `medication_reminder_scheduler_runs` (`suite_id`,`executed_at`);--> statement-breakpoint
CREATE INDEX `idx_med_reminder_scheduler_runs_result_executed` ON `medication_reminder_scheduler_runs` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `medication_reminder_scheduler_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_id` text NOT NULL,
	`scenario_key` text NOT NULL,
	`locale` text NOT NULL,
	`input_json` text NOT NULL,
	`expected_occurrence_count` integer NOT NULL,
	`expected_block_reason` text,
	`source_reference` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`suite_id`) REFERENCES `medication_reminder_scheduler_suites`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_med_reminder_scheduler_scenarios_suite_key` ON `medication_reminder_scheduler_scenarios` (`suite_id`,`scenario_key`);--> statement-breakpoint
CREATE INDEX `idx_med_reminder_scheduler_scenarios_suite_expected` ON `medication_reminder_scheduler_scenarios` (`suite_id`,`expected_occurrence_count`);--> statement-breakpoint
CREATE TABLE `medication_reminder_scheduler_suites` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`label` text NOT NULL,
	`source_reference` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_med_reminder_scheduler_suites_version` ON `medication_reminder_scheduler_suites` (`suite_version`);--> statement-breakpoint
CREATE INDEX `idx_med_reminder_scheduler_suites_status_updated` ON `medication_reminder_scheduler_suites` (`status`,`updated_at`);
PRAGMA optimize;
