CREATE TABLE `document_incident_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`operational_incident_id` text NOT NULL,
	`opened_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`signal_code` text NOT NULL,
	`evidence_reference` text NOT NULL,
	`affected_document_count` integer DEFAULT 0 NOT NULL,
	`affected_job_count` integer DEFAULT 0 NOT NULL,
	`customer_disclosures` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`acknowledged_by_user_id` text,
	`acknowledged_at` integer,
	`containment_code` text,
	`containment_reference` text,
	`containment_snapshot_json` text,
	`contained_by_user_id` text,
	`contained_at` integer,
	`recovery_evidence_code` text,
	`recovery_evidence_reference` text,
	`reconciliation_passed` integer DEFAULT false NOT NULL,
	`legal_hold_clear` integer DEFAULT false NOT NULL,
	`synthetic_validation_passed` integer DEFAULT false NOT NULL,
	`recovery_prepared_by_user_id` text,
	`recovery_prepared_at` integer,
	`recovery_reviewed_by_user_id` text,
	`recovery_decision` text,
	`recovery_reviewed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`operational_incident_id`) REFERENCES `operational_incidents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opened_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`acknowledged_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contained_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recovery_prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recovery_reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_incident_operational` ON `document_incident_commands` (`operational_incident_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_incident_request` ON `document_incident_commands` (`opened_by_user_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_document_incident_status_signal` ON `document_incident_commands` (`status`,`signal_code`,`created_at`);--> statement-breakpoint
CREATE TABLE `document_incident_events` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`coded_details_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `document_incident_commands`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_document_incident_event_case_created` ON `document_incident_events` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_document_incident_event_code_created` ON `document_incident_events` (`event_code`,`created_at`);