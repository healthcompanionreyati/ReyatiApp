CREATE TABLE `document_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`consent_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`recipient_provider_id` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `document_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`consent_id`) REFERENCES `consents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recipient_provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_document_shares_owner_status` ON `document_shares` (`owner_user_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_document_shares_provider_status` ON `document_shares` (`recipient_provider_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_document_shares_document_status` ON `document_shares` (`document_id`,`status`);--> statement-breakpoint
DROP INDEX `idx_document_records_owner_created`;--> statement-breakpoint
ALTER TABLE `document_records` ADD `status` text DEFAULT 'upload_pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `document_records` ADD `page_count` integer;--> statement-breakpoint
ALTER TABLE `document_records` ADD `captured_at` integer;--> statement-breakpoint
ALTER TABLE `document_records` ADD `malware_scan_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `document_records` ADD `quarantine_reason_code` text;--> statement-breakpoint
ALTER TABLE `document_records` ADD `retention_state` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `document_records` ADD `deletion_eligible_at` integer;--> statement-breakpoint
ALTER TABLE `document_records` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `document_records` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_document_records_owner_status_created` ON `document_records` (`owner_user_id`,`status`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
