CREATE TABLE `dependent_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`date_of_birth` text NOT NULL,
	`status` text DEFAULT 'pending_verification' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`age_of_majority_review_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_dependent_profiles_creator_status` ON `dependent_profiles` (`created_by_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_dependent_profiles_majority_review` ON `dependent_profiles` (`age_of_majority_review_at`,`status`);--> statement-breakpoint
CREATE TABLE `guardianship_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`dependent_id` text NOT NULL,
	`guardian_user_id` text NOT NULL,
	`authority_type` text NOT NULL,
	`status` text DEFAULT 'pending_verification' NOT NULL,
	`evidence_reference` text,
	`appointments_authority` integer DEFAULT false NOT NULL,
	`records_authority` integer DEFAULT false NOT NULL,
	`payments_authority` integer DEFAULT false NOT NULL,
	`consent_authority` integer DEFAULT false NOT NULL,
	`emergency_authority` integer DEFAULT false NOT NULL,
	`prepared_by_user_id` text,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dependent_id`) REFERENCES `dependent_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`guardian_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guardianship_assignments_dependent_guardian` ON `guardianship_assignments` (`dependent_id`,`guardian_user_id`);--> statement-breakpoint
CREATE INDEX `idx_guardianship_assignments_guardian_status` ON `guardianship_assignments` (`guardian_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_guardianship_assignments_status_updated` ON `guardianship_assignments` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `guardianship_events` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `guardianship_assignments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_guardianship_events_assignment_created` ON `guardianship_events` (`assignment_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
