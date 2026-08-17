CREATE TABLE `appointment_accommodation_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`accommodation_type` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`response_code` text,
	`responded_by_provider_id` text,
	`responded_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`responded_by_provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_accommodation_appointment_status` ON `appointment_accommodation_requests` (`appointment_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_accommodation_patient_status` ON `appointment_accommodation_requests` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `appointment_journey_events` (
	`id` text PRIMARY KEY NOT NULL,
	`module` text NOT NULL,
	`record_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`reason_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_journey_events_record_created` ON `appointment_journey_events` (`module`,`record_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_journey_events_appointment_created` ON `appointment_journey_events` (`appointment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `appointment_journey_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`clinical_decisions_made` integer NOT NULL,
	`appointments_changed` integer NOT NULL,
	`external_messages_sent` integer NOT NULL,
	`records_disclosed` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_journey_rehearsals_executed` ON `appointment_journey_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `appointment_preparation_guides` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`category` text NOT NULL,
	`instructions_en` text NOT NULL,
	`instructions_ar` text NOT NULL,
	`source_label` text DEFAULT 'provider_entered' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`acknowledged_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_preparation_guides_appointment` ON `appointment_preparation_guides` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_preparation_guides_provider_status` ON `appointment_preparation_guides` (`provider_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `care_timeline_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`entry_type` text NOT NULL,
	`status_code` text NOT NULL,
	`source_module` text NOT NULL,
	`source_record_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_timeline_source` ON `care_timeline_entries` (`source_module`,`source_record_id`,`status_code`);--> statement-breakpoint
CREATE INDEX `idx_care_timeline_patient_occurred` ON `care_timeline_entries` (`patient_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `post_visit_action_items` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`action_type` text NOT NULL,
	`title_en` text NOT NULL,
	`title_ar` text NOT NULL,
	`due_band` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_post_visit_patient_status` ON `post_visit_action_items` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_post_visit_provider_status` ON `post_visit_action_items` (`provider_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `pre_visit_intakes` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`concern_category` text NOT NULL,
	`duration_band` text NOT NULL,
	`medication_changes` text NOT NULL,
	`accessibility_note` text,
	`patient_confirmed` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`reviewed_by_provider_id` text,
	`reviewed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pre_visit_intakes_appointment` ON `pre_visit_intakes` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_pre_visit_intakes_patient_status` ON `pre_visit_intakes` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
