CREATE TABLE `document_capture_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`document_category` text NOT NULL,
	`document_date` text,
	`source_organization` text,
	`draft_text` text NOT NULL,
	`confirmation_state` text DEFAULT 'draft' NOT NULL,
	`source_label` text DEFAULT 'patient_entered_unverified' NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_capture_patient_status` ON `document_capture_drafts` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `health_data_quality_concerns` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`record_reference` text NOT NULL,
	`issue_type` text NOT NULL,
	`description` text NOT NULL,
	`workflow_state` text DEFAULT 'submitted' NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_quality_patient_state` ON `health_data_quality_concerns` (`patient_id`,`workflow_state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `health_record_index_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`record_type` text NOT NULL,
	`record_date` text NOT NULL,
	`title` text NOT NULL,
	`source_type` text NOT NULL,
	`source_reference` text,
	`source_label` text DEFAULT 'patient_entered_unverified' NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_record_index_patient_date` ON `health_record_index_entries` (`patient_id`,`record_date`);--> statement-breakpoint
CREATE INDEX `idx_record_index_patient_status` ON `health_record_index_entries` (`patient_id`,`status`);--> statement-breakpoint
CREATE TABLE `health_sharing_directives` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`purpose_code` text NOT NULL,
	`scope_code` text NOT NULL,
	`duration_days` integer NOT NULL,
	`recipient_type` text NOT NULL,
	`directive_state` text DEFAULT 'recorded_preference' NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_sharing_directive_patient_status` ON `health_sharing_directives` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `health_wallet_access_events` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`action_code` text NOT NULL,
	`resource_type` text NOT NULL,
	`outcome_code` text NOT NULL,
	`purpose_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_wallet_access_patient_created` ON `health_wallet_access_events` (`patient_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `health_wallet_operation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`module` text NOT NULL,
	`record_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_wallet_operations_record` ON `health_wallet_operation_events` (`module`,`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `health_wallet_operation_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`files_accepted` integer NOT NULL,
	`ocr_runs` integer NOT NULL,
	`access_granted` integer NOT NULL,
	`clinical_records_changed` integer NOT NULL,
	`external_transfers` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_wallet_rehearsal_executed` ON `health_wallet_operation_rehearsals` (`executed_at`);--> statement-breakpoint
PRAGMA optimize;
