CREATE TABLE `medication_reminder_delivery_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_version` text NOT NULL,
	`label` text NOT NULL,
	`template_en` text NOT NULL,
	`template_ar` text NOT NULL,
	`consent_version` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Qatar' NOT NULL,
	`quiet_hours_start` text NOT NULL,
	`quiet_hours_end` text NOT NULL,
	`quiet_hours_behavior` text NOT NULL,
	`maximum_lateness_minutes` integer NOT NULL,
	`max_attempts` integer NOT NULL,
	`retry_backoff_minutes_json` text NOT NULL,
	`dedupe_window_minutes` integer NOT NULL,
	`primary_owner_user_id` text NOT NULL,
	`backup_owner_user_id` text NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewer_user_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`primary_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`backup_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_med_reminder_delivery_policies_version` ON `medication_reminder_delivery_policies` (`policy_version`);--> statement-breakpoint
CREATE INDEX `idx_med_reminder_delivery_policies_status_updated` ON `medication_reminder_delivery_policies` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_med_reminder_delivery_policies_owner_status` ON `medication_reminder_delivery_policies` (`primary_owner_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `medication_reminder_delivery_policy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `medication_reminder_delivery_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_med_reminder_delivery_policy_events_policy_created` ON `medication_reminder_delivery_policy_events` (`policy_id`,`created_at`);
PRAGMA optimize;
