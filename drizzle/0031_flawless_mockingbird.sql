CREATE TABLE `security_alert_drills` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`initiated_by_user_id` text NOT NULL,
	`severity` text NOT NULL,
	`in_app_delivered` integer DEFAULT true NOT NULL,
	`external_delivered` integer DEFAULT false NOT NULL,
	`primary_notified` integer DEFAULT true NOT NULL,
	`backup_notified` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `security_alert_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_security_alert_drills_policy_created` ON `security_alert_drills` (`policy_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `security_alert_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`signal_type` text NOT NULL,
	`minimum_severity` text NOT NULL,
	`response_target_minutes` integer NOT NULL,
	`escalation_after_minutes` integer NOT NULL,
	`channel_type` text NOT NULL,
	`destination_alias` text NOT NULL,
	`primary_owner_user_id` text NOT NULL,
	`backup_owner_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`primary_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`backup_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_security_alert_policies_signal_type` ON `security_alert_policies` (`signal_type`);--> statement-breakpoint
CREATE INDEX `idx_security_alert_policies_status_updated` ON `security_alert_policies` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_security_alert_policies_owner_status` ON `security_alert_policies` (`primary_owner_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `security_alert_policy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `security_alert_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_security_alert_policy_events_policy_created` ON `security_alert_policy_events` (`policy_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
