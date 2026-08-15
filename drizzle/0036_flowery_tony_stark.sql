CREATE TABLE `pilot_enrollment_document_events` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `pilot_enrollment_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_enrollment_document_events_document_created` ON `pilot_enrollment_document_events` (`document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_enrollment_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`document_type` text NOT NULL,
	`audience` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`policy_version` text NOT NULL,
	`artifact_reference` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `controlled_pilot_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pilot_enrollment_document_plan_type_version` ON `pilot_enrollment_documents` (`plan_id`,`document_type`,`policy_version`);--> statement-breakpoint
CREATE INDEX `idx_pilot_enrollment_document_plan_status` ON `pilot_enrollment_documents` (`plan_id`,`status`);--> statement-breakpoint
PRAGMA optimize;
