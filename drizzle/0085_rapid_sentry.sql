CREATE TABLE `integration_payload_security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `integration_payload_security_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_payload_events` ON `integration_payload_security_events` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_payload_security_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_reference_hash` text NOT NULL,
	`exchange_type` text NOT NULL,
	`data_classification` text NOT NULL,
	`transport_protection` text NOT NULL,
	`message_integrity` text NOT NULL,
	`replay_protection` text NOT NULL,
	`minimization_profile` text NOT NULL,
	`logging_profile` text NOT NULL,
	`evidence_state` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integration_payload_profile_reference` ON `integration_payload_security_profiles` (`profile_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_payload_posture` ON `integration_payload_security_profiles` (`exchange_type`,`data_classification`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_payload_security_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`payloads_processed` integer NOT NULL,
	`messages_signed` integer NOT NULL,
	`messages_encrypted` integer NOT NULL,
	`keys_accessed` integer NOT NULL,
	`external_systems_contacted` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_payload_rehearsal` ON `integration_payload_security_rehearsals` (`executed_at`);--> statement-breakpoint
PRAGMA optimize;
