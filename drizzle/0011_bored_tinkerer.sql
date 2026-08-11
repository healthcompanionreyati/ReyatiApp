CREATE TABLE `care_relationship_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`relationship_id` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`accepted_by_user_id` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CHECK (`status` IN ('pending', 'accepting', 'accepted', 'revoked', 'expired')),
	FOREIGN KEY (`relationship_id`) REFERENCES `care_relationships`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_relationship_invitations_token` ON `care_relationship_invitations` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_relationship_invitations_relationship` ON `care_relationship_invitations` (`relationship_id`);--> statement-breakpoint
CREATE INDEX `idx_care_relationship_invitations_email_status` ON `care_relationship_invitations` (`email`,`status`);--> statement-breakpoint
CREATE TABLE `care_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`manager_user_id` text NOT NULL,
	`subject_user_id` text,
	`subject_label` text NOT NULL,
	`relationship_type` text NOT NULL,
	`status` text NOT NULL,
	`appointments_access` integer DEFAULT false NOT NULL,
	`records_access` integer DEFAULT false NOT NULL,
	`payments_access` integer DEFAULT false NOT NULL,
	`expires_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CHECK (`relationship_type` IN ('child', 'dependent', 'adult_family', 'caregiver')),
	CHECK (`status` IN ('pending_verification', 'pending_consent', 'active', 'revoked')),
	CHECK (`appointments_access` IN (0, 1)),
	CHECK (`records_access` IN (0, 1)),
	CHECK (`payments_access` IN (0, 1)),
	CHECK (`status` != 'active' OR `subject_user_id` IS NOT NULL),
	FOREIGN KEY (`manager_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subject_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_relationships_manager_status` ON `care_relationships` (`manager_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_care_relationships_subject_status` ON `care_relationships` (`subject_user_id`,`status`);
--> statement-breakpoint
PRAGMA optimize;
