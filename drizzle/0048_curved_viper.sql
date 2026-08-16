CREATE TABLE `medication_reminder_scheduler_run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text NOT NULL,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `medication_reminder_scheduler_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_med_reminder_scheduler_run_events_run_created` ON `medication_reminder_scheduler_run_events` (`run_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `medication_reminder_scheduler_runs` ADD `status` text DEFAULT 'pending_review' NOT NULL;--> statement-breakpoint
ALTER TABLE `medication_reminder_scheduler_runs` ADD `reviewer_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `medication_reminder_scheduler_runs` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `medication_reminder_scheduler_runs` ADD `review_note` text;--> statement-breakpoint
ALTER TABLE `medication_reminder_scheduler_runs` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_med_reminder_scheduler_runs_status_executed` ON `medication_reminder_scheduler_runs` (`status`,`executed_at`);--> statement-breakpoint
CREATE INDEX `idx_med_reminder_scheduler_runs_reviewer_reviewed` ON `medication_reminder_scheduler_runs` (`reviewer_user_id`,`reviewed_at`);
PRAGMA optimize;
