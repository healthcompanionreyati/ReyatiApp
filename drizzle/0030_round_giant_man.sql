CREATE TABLE `retention_automation_plan_events` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `retention_automation_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_retention_automation_plan_events_plan_created` ON `retention_automation_plan_events` (`plan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `retention_automation_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`record_class` text NOT NULL,
	`policy_id` text NOT NULL,
	`cadence` text NOT NULL,
	`batch_limit` integer NOT NULL,
	`schedule_reference` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `data_lifecycle_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_retention_automation_plans_record_class` ON `retention_automation_plans` (`record_class`);--> statement-breakpoint
CREATE INDEX `idx_retention_automation_plans_status_updated` ON `retention_automation_plans` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_retention_automation_plans_owner_status` ON `retention_automation_plans` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `retention_preview_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`policy_version` integer NOT NULL,
	`candidates` integer NOT NULL,
	`excluded_by_hold` integer NOT NULL,
	`examined` integer NOT NULL,
	`mode` text DEFAULT 'preview_only' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `retention_automation_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_retention_preview_runs_plan_created` ON `retention_preview_runs` (`plan_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
