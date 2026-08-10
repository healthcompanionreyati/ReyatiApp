CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`action_path` text,
	`resource_type` text,
	`resource_id` text,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_status_created` ON `notifications` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_created` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notifications_user_dedupe` ON `notifications` (`user_id`,`dedupe_key`);