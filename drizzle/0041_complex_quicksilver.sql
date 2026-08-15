CREATE TABLE `pilot_command_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`check_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`evidence_reference` text,
	`note` text,
	`recorded_by_user_id` text,
	`recorded_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `pilot_command_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pilot_command_checks_session_key` ON `pilot_command_checks` (`session_id`,`check_key`);--> statement-breakpoint
CREATE INDEX `idx_pilot_command_checks_session_status` ON `pilot_command_checks` (`session_id`,`status`);--> statement-breakpoint
CREATE TABLE `pilot_command_session_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `pilot_command_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_command_session_events_session_created` ON `pilot_command_session_events` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_command_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`session_reference` text NOT NULL,
	`shift_label` text NOT NULL,
	`shift_start_at` integer NOT NULL,
	`shift_end_at` integer NOT NULL,
	`commander_user_id` text NOT NULL,
	`stop_authority_user_id` text NOT NULL,
	`readiness_snapshot_json` text NOT NULL,
	`blocked_gate_count` integer NOT NULL,
	`verified_check_count` integer DEFAULT 0 NOT NULL,
	`total_check_count` integer NOT NULL,
	`mode` text DEFAULT 'synthetic_rehearsal' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `pilot_launch_packages`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commander_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`stop_authority_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pilot_command_sessions_package_reference` ON `pilot_command_sessions` (`package_id`,`session_reference`);--> statement-breakpoint
CREATE INDEX `idx_pilot_command_sessions_package_status` ON `pilot_command_sessions` (`package_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_pilot_command_sessions_status_shift` ON `pilot_command_sessions` (`status`,`shift_start_at`,`shift_end_at`);--> statement-breakpoint
PRAGMA optimize;
