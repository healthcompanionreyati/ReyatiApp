CREATE TABLE `contact_verification_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_method_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contact_method_id`) REFERENCES `contact_methods`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_contact_verification_contact_status_created` ON `contact_verification_challenges` (`contact_method_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_contact_verification_status_expires` ON `contact_verification_challenges` (`status`,`expires_at`);