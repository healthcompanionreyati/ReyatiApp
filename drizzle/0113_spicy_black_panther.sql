CREATE TABLE `document_release_authorization_events` (
	`id` text PRIMARY KEY NOT NULL,
	`authorization_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`coded_details_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`authorization_id`) REFERENCES `document_release_authorizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_document_release_events_authorization_created` ON `document_release_authorization_events` (`authorization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `document_release_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`lifecycle_acceptance_run_id` text NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`evidence_reference` text NOT NULL,
	`rollback_evidence_reference` text NOT NULL,
	`release_owner_user_id` text NOT NULL,
	`monitoring_owner_user_id` text NOT NULL,
	`stop_authority_user_id` text NOT NULL,
	`release_starts_at` integer NOT NULL,
	`release_ends_at` integer NOT NULL,
	`latest_activation_window_id` text NOT NULL,
	`latest_assurance_run_id` text NOT NULL,
	`check_count` integer NOT NULL,
	`passed_checks` integer NOT NULL,
	`failed_checks` integer NOT NULL,
	`check_results_json` text NOT NULL,
	`exception_signal_count` integer DEFAULT 0 NOT NULL,
	`active_incident_count` integer DEFAULT 0 NOT NULL,
	`data_mode` text DEFAULT 'aggregate_only' NOT NULL,
	`customer_records_read` integer DEFAULT 0 NOT NULL,
	`objects_read` integer DEFAULT 0 NOT NULL,
	`objects_changed` integer DEFAULT 0 NOT NULL,
	`external_systems_contacted` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`reviewed_by_user_id` text,
	`review_note` text,
	`reviewed_at` integer,
	`revoked_by_user_id` text,
	`revoked_at` integer,
	`revocation_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`lifecycle_acceptance_run_id`) REFERENCES `data_lifecycle_acceptance_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`release_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`monitoring_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`stop_authority_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_release_reference` ON `document_release_authorizations` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_release_request` ON `document_release_authorizations` (`prepared_by_user_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_document_release_status_window` ON `document_release_authorizations` (`status`,`release_starts_at`,`release_ends_at`);--> statement-breakpoint
CREATE INDEX `idx_document_release_acceptance_created` ON `document_release_authorizations` (`lifecycle_acceptance_run_id`,`created_at`);