CREATE TABLE `virtual_care_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`reason_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `virtual_care_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_virtual_care_events_session_created` ON `virtual_care_events` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_virtual_care_events_action_created` ON `virtual_care_events` (`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `virtual_care_readiness_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`camera_ready` integer NOT NULL,
	`microphone_ready` integer NOT NULL,
	`connection_ready` integer NOT NULL,
	`private_space_ready` integer NOT NULL,
	`emergency_boundary_acknowledged` integer NOT NULL,
	`locale` text NOT NULL,
	`result` text NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `virtual_care_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_virtual_care_readiness_session_submitted` ON `virtual_care_readiness_checks` (`session_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_virtual_care_readiness_actor_submitted` ON `virtual_care_readiness_checks` (`actor_user_id`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `virtual_care_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`media_sessions_created` integer NOT NULL,
	`external_messages_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_virtual_care_rehearsals_result_executed` ON `virtual_care_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE INDEX `idx_virtual_care_rehearsals_executor_executed` ON `virtual_care_rehearsals` (`executed_by_user_id`,`executed_at`);--> statement-breakpoint
CREATE TABLE `virtual_care_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`patient_readiness_status` text DEFAULT 'not_started' NOT NULL,
	`patient_ready_at` integer,
	`patient_entered_at` integer,
	`provider_ready_at` integer,
	`fallback_status` text DEFAULT 'not_required' NOT NULL,
	`fallback_reason_code` text,
	`media_session_created` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_virtual_care_sessions_appointment` ON `virtual_care_sessions` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_virtual_care_sessions_status_updated` ON `virtual_care_sessions` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_virtual_care_sessions_fallback_updated` ON `virtual_care_sessions` (`fallback_status`,`updated_at`);
--> statement-breakpoint
PRAGMA optimize;
