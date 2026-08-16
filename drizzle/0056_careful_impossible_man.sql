CREATE TABLE `patient_experience_events` (
	`id` text PRIMARY KEY NOT NULL,
	`survey_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`survey_id`) REFERENCES `patient_experience_surveys`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_patient_experience_events_survey_created` ON `patient_experience_events` (`survey_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `patient_experience_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`responses_created` integer NOT NULL,
	`provider_actions_created` integer NOT NULL,
	`external_exports` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_patient_experience_rehearsals_result_executed` ON `patient_experience_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `patient_experience_surveys` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`survey_type` text NOT NULL,
	`overall_rating` integer NOT NULL,
	`access_rating` integer NOT NULL,
	`communication_rating` integer NOT NULL,
	`respect_rating` integer NOT NULL,
	`clarity_rating` integer NOT NULL,
	`structured_tags_json` text DEFAULT '[]' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`consent_version` text NOT NULL,
	`withdrawn_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_patient_experience_appointment_type` ON `patient_experience_surveys` (`appointment_id`,`survey_type`);--> statement-breakpoint
CREATE INDEX `idx_patient_experience_patient_status_created` ON `patient_experience_surveys` (`patient_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_patient_experience_provider_type_status` ON `patient_experience_surveys` (`provider_id`,`survey_type`,`status`);--> statement-breakpoint
PRAGMA optimize;
