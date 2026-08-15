CREATE TABLE `controlled_pilot_cohort_events` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `controlled_pilot_cohort_members`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_controlled_pilot_cohort_events_member_created` ON `controlled_pilot_cohort_events` (`member_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `controlled_pilot_cohort_members` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`participant_type` text NOT NULL,
	`status` text DEFAULT 'nominated' NOT NULL,
	`nominated_by_user_id` text NOT NULL,
	`accepted_at` integer,
	`removed_at` integer,
	`note` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `controlled_pilot_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`nominated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_controlled_pilot_cohort_plan_user` ON `controlled_pilot_cohort_members` (`plan_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_controlled_pilot_cohort_plan_type_status` ON `controlled_pilot_cohort_members` (`plan_id`,`participant_type`,`status`);--> statement-breakpoint
PRAGMA optimize;
