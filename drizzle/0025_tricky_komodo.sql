CREATE TABLE `pilot_control_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`control_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`backup_owner_user_id` text,
	`response_target_minutes` integer NOT NULL,
	`escalation_path` text NOT NULL,
	`evidence_reference` text,
	`evidence_status` text DEFAULT 'draft' NOT NULL,
	`last_rehearsed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`backup_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pilot_control_assignments_control` ON `pilot_control_assignments` (`control_id`);--> statement-breakpoint
CREATE INDEX `idx_pilot_control_assignments_owner_status` ON `pilot_control_assignments` (`owner_user_id`,`evidence_status`);--> statement-breakpoint
CREATE INDEX `idx_pilot_control_assignments_evidence_rehearsed` ON `pilot_control_assignments` (`evidence_status`,`last_rehearsed_at`);--> statement-breakpoint
PRAGMA optimize;
