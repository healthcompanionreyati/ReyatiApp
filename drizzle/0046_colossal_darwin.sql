CREATE TABLE `medication_reminder_events` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `medication_reminder_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_medication_reminder_events_plan_created` ON `medication_reminder_events` (`plan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `medication_reminder_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`medication_label` text NOT NULL,
	`directions_label` text NOT NULL,
	`source_type` text DEFAULT 'patient_entered' NOT NULL,
	`source_reference` text NOT NULL,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`timezone` text DEFAULT 'Asia/Qatar' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`status` text DEFAULT 'configured' NOT NULL,
	`acknowledgement_version` text NOT NULL,
	`acknowledged_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_medication_reminder_plans_user_status_created` ON `medication_reminder_plans` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_medication_reminder_plans_user_start` ON `medication_reminder_plans` (`user_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `medication_reminder_times` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`local_time` text NOT NULL,
	`days_of_week_json` text DEFAULT '[0,1,2,3,4,5,6]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `medication_reminder_plans`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_medication_reminder_times_plan_time` ON `medication_reminder_times` (`plan_id`,`local_time`);--> statement-breakpoint
CREATE INDEX `idx_medication_reminder_times_plan` ON `medication_reminder_times` (`plan_id`);--> statement-breakpoint
PRAGMA optimize;
