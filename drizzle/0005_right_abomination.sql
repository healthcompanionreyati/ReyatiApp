CREATE TABLE `organization_verification_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`decision` text NOT NULL,
	`verification_version` integer NOT NULL,
	`notes` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_organization_reviews_org_created` ON `organization_verification_reviews` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_organization_reviews_reviewer_created` ON `organization_verification_reviews` (`reviewer_user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_organization_reviews_org_version` ON `organization_verification_reviews` (`organization_id`,`verification_version`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `verification_version` integer DEFAULT 1 NOT NULL;