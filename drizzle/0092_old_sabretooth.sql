CREATE TABLE `document_scan_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_reference` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`lease_expires_at` integer,
	`last_error_code` text,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `document_records`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_scan_jobs_document` ON `document_scan_jobs` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_scan_jobs_provider_reference` ON `document_scan_jobs` (`provider`,`provider_reference`);--> statement-breakpoint
CREATE INDEX `idx_document_scan_jobs_status_next_attempt` ON `document_scan_jobs` (`status`,`next_attempt_at`);