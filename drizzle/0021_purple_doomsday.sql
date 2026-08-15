CREATE TABLE `document_access_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`share_id` text,
	`requester_user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `document_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`share_id`) REFERENCES `document_shares`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requester_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_access_grants_token_hash` ON `document_access_grants` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_document_access_grants_requester_status` ON `document_access_grants` (`requester_user_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_document_access_grants_document_status` ON `document_access_grants` (`document_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `document_deletion_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`legal_hold` integer DEFAULT false NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`lease_expires_at` integer,
	`last_error_code` text,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `document_records`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_deletion_jobs_document` ON `document_deletion_jobs` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_document_deletion_jobs_status_lease` ON `document_deletion_jobs` (`status`,`lease_expires_at`);--> statement-breakpoint
CREATE TABLE `document_processing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`event_type` text NOT NULL,
	`provider_reference` text,
	`reason_code` text,
	`dedupe_key` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `document_records`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_processing_events_dedupe` ON `document_processing_events` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_document_processing_events_document_occurred` ON `document_processing_events` (`document_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `document_upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`document_id` text,
	`object_key` text NOT NULL,
	`expected_content_type` text NOT NULL,
	`expected_size_bytes` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`expires_at` integer NOT NULL,
	`cancelled_at` integer,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`document_id`) REFERENCES `document_records`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_upload_sessions_object_key` ON `document_upload_sessions` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_upload_sessions_owner_idempotency` ON `document_upload_sessions` (`owner_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_document_upload_sessions_owner_status` ON `document_upload_sessions` (`owner_user_id`,`status`,`expires_at`);