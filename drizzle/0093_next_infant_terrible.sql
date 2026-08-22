CREATE TABLE `retention_execution_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`policy_id` text NOT NULL,
	`run_key` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`examined` integer DEFAULT 0 NOT NULL,
	`queued` integer DEFAULT 0 NOT NULL,
	`excluded_by_hold` integer DEFAULT 0 NOT NULL,
	`excluded_by_access` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`lease_expires_at` integer,
	`last_error_code` text,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `retention_automation_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`policy_id`) REFERENCES `data_lifecycle_policies`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_retention_execution_runs_key` ON `retention_execution_runs` (`run_key`);--> statement-breakpoint
CREATE INDEX `idx_retention_execution_runs_plan_created` ON `retention_execution_runs` (`plan_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_retention_execution_runs_status_lease` ON `retention_execution_runs` (`status`,`lease_expires_at`);