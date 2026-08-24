CREATE TABLE `document_activation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`window_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`coded_details_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`window_id`) REFERENCES `document_activation_windows`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_document_activation_events_window_created` ON `document_activation_events` (`window_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `document_activation_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`evidence_reference` text NOT NULL,
	`target_environment` text DEFAULT 'production' NOT NULL,
	`window_starts_at` integer NOT NULL,
	`window_ends_at` integer NOT NULL,
	`change_owner` text NOT NULL,
	`monitoring_owner` text NOT NULL,
	`rollback_owner` text NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`reviewed_by_user_id` text,
	`review_note` text,
	`reviewed_at` integer,
	`opened_by_user_id` text,
	`opened_at` integer,
	`posture_snapshot_json` text,
	`posture_observed_at` integer,
	`verified_by_user_id` text,
	`verification_note` text,
	`verified_at` integer,
	`rollback_verified_by_user_id` text,
	`rollback_verified_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opened_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rollback_verified_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_activation_reference` ON `document_activation_windows` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_activation_request` ON `document_activation_windows` (`prepared_by_user_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_document_activation_status_window` ON `document_activation_windows` (`status`,`window_starts_at`,`window_ends_at`);