CREATE TABLE `health_measurement_records` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`measurement_type` text NOT NULL,
	`numeric_value` real NOT NULL,
	`secondary_value` real,
	`unit` text NOT NULL,
	`measured_at` integer NOT NULL,
	`context_code` text NOT NULL,
	`source_label` text DEFAULT 'patient_entered_unverified' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_measurement_patient_type_time` ON `health_measurement_records` (`patient_id`,`measurement_type`,`measured_at`);--> statement-breakpoint
CREATE INDEX `idx_measurement_patient_status` ON `health_measurement_records` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `patient_immunization_records` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`vaccine_category` text NOT NULL,
	`product_label` text,
	`dose_label` text NOT NULL,
	`administered_on` text NOT NULL,
	`country_code` text,
	`source_label` text DEFAULT 'patient_entered_unverified' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_immunization_patient_date` ON `patient_immunization_records` (`patient_id`,`administered_on`);--> statement-breakpoint
CREATE INDEX `idx_immunization_patient_status` ON `patient_immunization_records` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `personal_tracking_events` (
	`id` text PRIMARY KEY NOT NULL,
	`module` text NOT NULL,
	`record_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_personal_tracking_events_record` ON `personal_tracking_events` (`module`,`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `personal_tracking_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`clinical_decisions_made` integer NOT NULL,
	`provider_records_disclosed` integer NOT NULL,
	`external_messages_sent` integer NOT NULL,
	`device_imports_performed` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_personal_tracking_rehearsals_executed` ON `personal_tracking_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `preventive_screening_records` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`screening_category` text NOT NULL,
	`completion_state` text NOT NULL,
	`performed_on` text,
	`next_due_band` text,
	`provider_reference` text,
	`source_label` text DEFAULT 'patient_entered_unverified' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_screening_patient_category` ON `preventive_screening_records` (`patient_id`,`screening_category`,`status`);--> statement-breakpoint
CREATE INDEX `idx_screening_patient_updated` ON `preventive_screening_records` (`patient_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `symptom_journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`symptom_category` text NOT NULL,
	`severity_band` text NOT NULL,
	`started_band` text NOT NULL,
	`trend` text NOT NULL,
	`note` text,
	`emergency_warning_acknowledged` integer DEFAULT false NOT NULL,
	`source_label` text DEFAULT 'patient_entered_unverified' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_symptom_patient_created` ON `symptom_journal_entries` (`patient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_symptom_patient_status` ON `symptom_journal_entries` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `wellness_journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`sleep_band` text NOT NULL,
	`activity_band` text NOT NULL,
	`energy_band` text NOT NULL,
	`note` text,
	`source_label` text DEFAULT 'patient_entered_unverified' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_wellness_patient_date` ON `wellness_journal_entries` (`patient_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `idx_wellness_patient_status` ON `wellness_journal_entries` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
