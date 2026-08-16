CREATE TABLE `care_message_events` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`appointment_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text,
	`reason_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `care_message_threads`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_message_events_thread_created` ON `care_message_events` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_care_message_events_action_created` ON `care_message_events` (`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `care_message_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`purpose` text DEFAULT 'follow_up' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`opens_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_message_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_message_threads_appointment` ON `care_message_threads` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_care_message_threads_patient_status_updated` ON `care_message_threads` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_care_message_threads_provider_status_updated` ON `care_message_threads` (`provider_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_care_message_threads_status_expires` ON `care_message_threads` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `care_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`sender_user_id` text NOT NULL,
	`sender_role` text NOT NULL,
	`body_text` text NOT NULL,
	`safety_classification` text DEFAULT 'standard' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `care_message_threads`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_messages_thread_created` ON `care_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_care_messages_sender_created` ON `care_messages` (`sender_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `care_messaging_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`messages_persisted` integer NOT NULL,
	`external_messages_sent` integer NOT NULL,
	`clinical_actions_created` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_messaging_rehearsals_result_executed` ON `care_messaging_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE INDEX `idx_care_messaging_rehearsals_executor_executed` ON `care_messaging_rehearsals` (`executed_by_user_id`,`executed_at`);
--> statement-breakpoint
PRAGMA optimize;
