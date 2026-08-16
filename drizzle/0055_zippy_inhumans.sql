CREATE TABLE `care_referral_events` (
	`id` text PRIMARY KEY NOT NULL,
	`referral_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`reason_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`referral_id`) REFERENCES `care_referrals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_referral_events_referral_created` ON `care_referral_events` (`referral_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_care_referral_events_action_created` ON `care_referral_events` (`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `care_referral_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`appointments_created` integer NOT NULL,
	`external_messages_sent` integer NOT NULL,
	`clinical_records_transferred` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_referral_rehearsals_result_executed` ON `care_referral_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE INDEX `idx_care_referral_rehearsals_executor_executed` ON `care_referral_rehearsals` (`executed_by_user_id`,`executed_at`);--> statement-breakpoint
CREATE TABLE `care_referrals` (
	`id` text PRIMARY KEY NOT NULL,
	`source_appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`referring_provider_id` text NOT NULL,
	`receiving_provider_id` text,
	`requested_specialty` text NOT NULL,
	`reason_summary` text NOT NULL,
	`status` text DEFAULT 'initiated' NOT NULL,
	`patient_consent_version` text,
	`patient_consented_at` integer,
	`provider_responded_at` integer,
	`expires_at` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`source_appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`referring_provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`receiving_provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_referrals_referrer_idempotency` ON `care_referrals` (`referring_provider_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_care_referrals_patient_status_updated` ON `care_referrals` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_care_referrals_referrer_status_updated` ON `care_referrals` (`referring_provider_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_care_referrals_receiver_status_updated` ON `care_referrals` (`receiving_provider_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_care_referrals_status_expires` ON `care_referrals` (`status`,`expires_at`);
--> statement-breakpoint
PRAGMA optimize;
