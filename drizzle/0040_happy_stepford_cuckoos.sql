CREATE TABLE `pilot_launch_package_events` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `pilot_launch_packages`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_launch_package_events_package_created` ON `pilot_launch_package_events` (`package_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_launch_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`package_version` text NOT NULL,
	`activation_window_start` integer NOT NULL,
	`activation_window_end` integer NOT NULL,
	`primary_owner_user_id` text NOT NULL,
	`backup_owner_user_id` text NOT NULL,
	`support_reference` text NOT NULL,
	`rollback_target_minutes` integer NOT NULL,
	`participant_contact_target_hours` integer NOT NULL,
	`readiness_snapshot_json` text NOT NULL,
	`blocked_gate_count` integer NOT NULL,
	`total_gate_count` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `controlled_pilot_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`primary_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`backup_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pilot_launch_packages_plan_package_version` ON `pilot_launch_packages` (`plan_id`,`package_version`);--> statement-breakpoint
CREATE INDEX `idx_pilot_launch_packages_plan_status` ON `pilot_launch_packages` (`plan_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_pilot_launch_packages_status_window` ON `pilot_launch_packages` (`status`,`activation_window_start`,`activation_window_end`);--> statement-breakpoint
CREATE TABLE `pilot_rollback_drill_events` (
	`id` text PRIMARY KEY NOT NULL,
	`drill_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`drill_id`) REFERENCES `pilot_rollback_drills`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_rollback_drill_events_drill_created` ON `pilot_rollback_drill_events` (`drill_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_rollback_drills` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`scenario` text NOT NULL,
	`synthetic_reference` text NOT NULL,
	`containment_minutes` integer NOT NULL,
	`contact_minutes` integer NOT NULL,
	`open_action_count` integer NOT NULL,
	`result` text NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`run_by_user_id` text NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `pilot_launch_packages`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`run_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pilot_rollback_drills_package_reference` ON `pilot_rollback_drills` (`package_id`,`synthetic_reference`);--> statement-breakpoint
CREATE INDEX `idx_pilot_rollback_drills_package_status_created` ON `pilot_rollback_drills` (`package_id`,`status`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
