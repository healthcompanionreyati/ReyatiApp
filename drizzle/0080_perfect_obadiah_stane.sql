CREATE TABLE `exchange_reconciliation_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`event_reference_hash` text NOT NULL,
	`connection_reference` text NOT NULL,
	`event_family` text NOT NULL,
	`anomaly_code` text NOT NULL,
	`severity_band` text NOT NULL,
	`source_time_band` text NOT NULL,
	`disposition_code` text DEFAULT 'unassigned' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`resolution_prepared_by_user_id` text,
	`resolution_reviewed_by_user_id` text,
	`opened_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resolution_prepared_at` integer,
	`resolution_reviewed_at` integer,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolution_prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolution_reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_exchange_case_event_hash` ON `exchange_reconciliation_cases` (`event_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_exchange_case_status_severity` ON `exchange_reconciliation_cases` (`status`,`severity_band`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_exchange_case_connection` ON `exchange_reconciliation_cases` (`connection_reference`,`updated_at`);--> statement-breakpoint
CREATE TABLE `exchange_reconciliation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`reason_code` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `exchange_reconciliation_cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_exchange_events_case` ON `exchange_reconciliation_events` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `exchange_reconciliation_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`events_replayed` integer NOT NULL,
	`records_corrected` integer NOT NULL,
	`callbacks_sent` integer NOT NULL,
	`clinical_payloads_disclosed` integer NOT NULL,
	`cases_auto_closed` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_exchange_rehearsal_executed` ON `exchange_reconciliation_rehearsals` (`executed_at`);--> statement-breakpoint
PRAGMA optimize;
