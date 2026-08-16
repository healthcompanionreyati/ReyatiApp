CREATE TABLE `prescription_extraction_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_id` text NOT NULL,
	`case_key` text NOT NULL,
	`locale` text NOT NULL,
	`source_reference` text NOT NULL,
	`source_checksum_sha256` text NOT NULL,
	`document_id` text,
	`document_version` integer,
	`extracted_fields_json` text NOT NULL,
	`expected_decision` text NOT NULL,
	`status` text DEFAULT 'review_required' NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`human_verification_required` integer DEFAULT true NOT NULL,
	`reviewer_provider_id` text,
	`review_decision` text,
	`review_note` text,
	`reviewed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`suite_id`) REFERENCES `prescription_extraction_suites`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`document_id`) REFERENCES `document_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_prescription_extraction_cases_suite_key` ON `prescription_extraction_cases` (`suite_id`,`case_key`);--> statement-breakpoint
CREATE INDEX `idx_prescription_extraction_cases_status_created` ON `prescription_extraction_cases` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_prescription_extraction_cases_reviewer_reviewed` ON `prescription_extraction_cases` (`reviewer_provider_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `prescription_extraction_evaluation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_id` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`total_cases` integer NOT NULL,
	`reviewed_cases` integer NOT NULL,
	`correct_decisions` integer NOT NULL,
	`unsafe_acceptances` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`suite_id`) REFERENCES `prescription_extraction_suites`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_prescription_extraction_runs_suite_executed` ON `prescription_extraction_evaluation_runs` (`suite_id`,`executed_at`);--> statement-breakpoint
CREATE INDEX `idx_prescription_extraction_runs_result_executed` ON `prescription_extraction_evaluation_runs` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `prescription_extraction_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `prescription_extraction_cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_prescription_extraction_events_case_created` ON `prescription_extraction_events` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `prescription_extraction_suites` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`label` text NOT NULL,
	`source_reference` text NOT NULL,
	`engine_alias` text NOT NULL,
	`model_version` text NOT NULL,
	`minimum_confidence_bps` integer NOT NULL,
	`critical_field_confidence_bps` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_prescription_extraction_suites_version` ON `prescription_extraction_suites` (`suite_version`);--> statement-breakpoint
CREATE INDEX `idx_prescription_extraction_suites_status_updated` ON `prescription_extraction_suites` (`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
