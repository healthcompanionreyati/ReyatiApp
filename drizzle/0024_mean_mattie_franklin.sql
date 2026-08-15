CREATE TABLE `care_continuity_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`assigned_to_user_id` text,
	`status` text DEFAULT 'needs_review' NOT NULL,
	`resolution_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_continuity_appointment` ON `care_continuity_cases` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_care_continuity_status_updated` ON `care_continuity_cases` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_care_continuity_org_status` ON `care_continuity_cases` (`organization_id`,`status`);--> statement-breakpoint
PRAGMA optimize;
