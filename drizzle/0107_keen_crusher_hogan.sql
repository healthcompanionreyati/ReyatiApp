CREATE TABLE `payment_incident_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`source_assurance_run_id` text,
	`opened_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`severity` text NOT NULL,
	`signal_code` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`backup_user_id` text NOT NULL,
	`containment_target_minutes` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`containment_code` text,
	`contained_by_user_id` text,
	`contained_at` integer,
	`recovery_evidence_code` text,
	`recovery_prepared_by_user_id` text,
	`recovery_prepared_at` integer,
	`recovery_reviewed_by_user_id` text,
	`recovery_decision` text,
	`recovery_reviewed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`source_assurance_run_id`) REFERENCES `payment_activation_assurance_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opened_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`backup_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contained_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recovery_prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recovery_reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_incident_request` ON `payment_incident_cases` (`opened_by_user_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_incident_status_severity` ON `payment_incident_cases` (`status`,`severity`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_incident_assurance` ON `payment_incident_cases` (`source_assurance_run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_incident_events` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`coded_details_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `payment_incident_cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_payment_incident_event_case_created` ON `payment_incident_events` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_incident_event_code_created` ON `payment_incident_events` (`event_code`,`created_at`);