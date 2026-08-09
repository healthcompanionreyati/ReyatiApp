CREATE TABLE `organization_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`accepted_by_user_id` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_organization_invitations_token_hash` ON `organization_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_organization_invitations_org_status` ON `organization_invitations` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_organization_invitations_email_status` ON `organization_invitations` (`email`,`status`);--> statement-breakpoint
CREATE TABLE `platform_roles` (
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `role`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_platform_roles_role_status` ON `platform_roles` (`role`,`status`);--> statement-breakpoint
CREATE TABLE `provider_verification_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`decision` text NOT NULL,
	`verification_version` integer NOT NULL,
	`notes` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_provider_verification_reviews_provider_created` ON `provider_verification_reviews` (`provider_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_provider_verification_reviews_reviewer_created` ON `provider_verification_reviews` (`reviewer_user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_provider_verification_reviews_provider_version` ON `provider_verification_reviews` (`provider_id`,`verification_version`);--> statement-breakpoint
ALTER TABLE `provider_profiles` ADD `verification_version` integer DEFAULT 1 NOT NULL;