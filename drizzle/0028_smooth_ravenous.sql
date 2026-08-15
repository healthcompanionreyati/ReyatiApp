CREATE TABLE `data_lifecycle_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`record_class` text NOT NULL,
	`retention_months` integer NOT NULL,
	`retention_trigger` text NOT NULL,
	`disposition` text NOT NULL,
	`legal_basis_reference` text NOT NULL,
	`evidence_reference` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`effective_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_data_lifecycle_policies_record_class` ON `data_lifecycle_policies` (`record_class`);--> statement-breakpoint
CREATE INDEX `idx_data_lifecycle_policies_status_updated` ON `data_lifecycle_policies` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_data_lifecycle_policies_owner_status` ON `data_lifecycle_policies` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `data_lifecycle_policy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `data_lifecycle_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_data_lifecycle_policy_events_policy_created` ON `data_lifecycle_policy_events` (`policy_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
