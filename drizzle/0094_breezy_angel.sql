CREATE TABLE `retention_safety_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`documents_changed` integer DEFAULT 0 NOT NULL,
	`deletion_jobs_created` integer DEFAULT 0 NOT NULL,
	`objects_deleted` integer DEFAULT 0 NOT NULL,
	`external_calls` integer DEFAULT 0 NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_retention_safety_rehearsals_executed` ON `retention_safety_rehearsals` (`executed_at`);