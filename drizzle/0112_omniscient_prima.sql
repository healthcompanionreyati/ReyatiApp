CREATE TABLE `document_stability_assurance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`assurance_run_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_decision` text,
	`next_decision` text NOT NULL,
	`coded_details_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assurance_run_id`) REFERENCES `document_stability_assurance_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_document_assurance_event_run_created` ON `document_stability_assurance_events` (`assurance_run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_document_assurance_event_code_created` ON `document_stability_assurance_events` (`event_code`,`created_at`);--> statement-breakpoint
CREATE TABLE `document_stability_assurance_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`activation_window_id` text NOT NULL,
	`collected_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`framework_version` text NOT NULL,
	`evidence_reference` text NOT NULL,
	`target_environment` text DEFAULT 'production' NOT NULL,
	`observation_started_at` integer NOT NULL,
	`observation_ended_at` integer NOT NULL,
	`observation_window_minutes` integer NOT NULL,
	`protected_storage_configured` integer DEFAULT false NOT NULL,
	`private_scanner_configured` integer DEFAULT false NOT NULL,
	`runtime_controls_enabled` integer DEFAULT false NOT NULL,
	`total_document_count` integer DEFAULT 0 NOT NULL,
	`quarantined_document_count` integer DEFAULT 0 NOT NULL,
	`stuck_scan_job_count` integer DEFAULT 0 NOT NULL,
	`failed_scan_job_count` integer DEFAULT 0 NOT NULL,
	`failed_deletion_job_count` integer DEFAULT 0 NOT NULL,
	`legal_hold_conflict_count` integer DEFAULT 0 NOT NULL,
	`failed_retention_run_count` integer DEFAULT 0 NOT NULL,
	`active_incident_count` integer DEFAULT 0 NOT NULL,
	`check_count` integer NOT NULL,
	`passed_checks` integer NOT NULL,
	`failed_checks` integer NOT NULL,
	`check_results_json` text NOT NULL,
	`result` text NOT NULL,
	`decision` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_user_id` text,
	`review_note` text,
	`reviewed_at` integer,
	`data_mode` text DEFAULT 'aggregate_only' NOT NULL,
	`customer_records_read` integer DEFAULT 0 NOT NULL,
	`objects_read` integer DEFAULT 0 NOT NULL,
	`objects_changed` integer DEFAULT 0 NOT NULL,
	`scanner_calls_made` integer DEFAULT 0 NOT NULL,
	`external_messages_sent` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`collected_at` integer NOT NULL,
	FOREIGN KEY (`activation_window_id`) REFERENCES `document_activation_windows`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`collected_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_assurance_request` ON `document_stability_assurance_runs` (`collected_by_user_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_document_assurance_activation_collected` ON `document_stability_assurance_runs` (`activation_window_id`,`collected_at`);--> statement-breakpoint
CREATE INDEX `idx_document_assurance_result_decision` ON `document_stability_assurance_runs` (`result`,`decision`,`collected_at`);