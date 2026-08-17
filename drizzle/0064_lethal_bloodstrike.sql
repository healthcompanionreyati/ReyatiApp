CREATE TABLE `complaint_events` (
	`id` text PRIMARY KEY NOT NULL,
	`complaint_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_scope` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`queue` text NOT NULL,
	`severity` text NOT NULL,
	`reason_code` text,
	`resource_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_complaint_events_complaint_created` ON `complaint_events` (`complaint_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_complaint_events_queue_action_created` ON `complaint_events` (`queue`,`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `complaint_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`complaints_created` integer DEFAULT 0 NOT NULL,
	`clinical_triages_created` integer DEFAULT 0 NOT NULL,
	`emergency_dispatches_created` integer DEFAULT 0 NOT NULL,
	`regulator_submissions_sent` integer DEFAULT 0 NOT NULL,
	`provider_notifications_sent` integer DEFAULT 0 NOT NULL,
	`compensation_actions_created` integer DEFAULT 0 NOT NULL,
	`external_tickets_created` integer DEFAULT 0 NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_complaint_rehearsals_executed` ON `complaint_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `complaint_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`complaint_id` text NOT NULL,
	`submitted_by_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_complaint_submissions_complaint_created` ON `complaint_submissions` (`complaint_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `complaints` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`patient_user_id` text NOT NULL,
	`category` text NOT NULL,
	`queue` text NOT NULL,
	`subject` text NOT NULL,
	`narrative` text NOT NULL,
	`desired_outcome` text NOT NULL,
	`appointment_id` text,
	`support_case_id` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`severity` text DEFAULT 'unassessed' NOT NULL,
	`assigned_to_user_id` text,
	`resolution_reason_code` text,
	`resolution_summary` text,
	`submitted_at` integer NOT NULL,
	`resolved_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`support_case_id`) REFERENCES `support_cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_complaints_reference` ON `complaints` (`reference`);--> statement-breakpoint
CREATE INDEX `idx_complaints_patient_status_updated` ON `complaints` (`patient_user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_complaints_queue_status_severity` ON `complaints` (`queue`,`status`,`severity`);--> statement-breakpoint
CREATE INDEX `idx_complaints_assignee_status_updated` ON `complaints` (`assigned_to_user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_complaints_appointment_created` ON `complaints` (`appointment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_complaints_support_case_created` ON `complaints` (`support_case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `consent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text,
	`consent_id` text,
	`subject_user_id` text,
	`actor_user_id` text NOT NULL,
	`actor_scope` text NOT NULL,
	`action` text NOT NULL,
	`purpose_code` text NOT NULL,
	`policy_version` integer NOT NULL,
	`resource_version` integer NOT NULL,
	`reason_code` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `consent_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`consent_id`) REFERENCES `patient_consents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subject_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_consent_events_subject_occurred` ON `consent_events` (`subject_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_consent_events_policy_occurred` ON `consent_events` (`policy_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_consent_events_consent_occurred` ON `consent_events` (`consent_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `consent_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose_code` text NOT NULL,
	`policy_version` integer NOT NULL,
	`title_en` text NOT NULL,
	`title_ar` text NOT NULL,
	`summary_en` text NOT NULL,
	`summary_ar` text NOT NULL,
	`notice_en` text NOT NULL,
	`notice_ar` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_decision` text,
	`activated_at` integer,
	`effective_from` integer NOT NULL,
	`expires_at` integer,
	`retired_at` integer,
	`resource_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_consent_policies_purpose_version` ON `consent_policies` (`purpose_code`,`policy_version`);--> statement-breakpoint
CREATE INDEX `idx_consent_policies_purpose_status_effective` ON `consent_policies` (`purpose_code`,`status`,`effective_from`);--> statement-breakpoint
CREATE INDEX `idx_consent_policies_status_updated` ON `consent_policies` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `consent_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`policies_changed` integer DEFAULT 0 NOT NULL,
	`consents_granted` integer DEFAULT 0 NOT NULL,
	`consents_withdrawn` integer DEFAULT 0 NOT NULL,
	`downstream_activations` integer DEFAULT 0 NOT NULL,
	`external_synchronizations` integer DEFAULT 0 NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_consent_rehearsals_executed` ON `consent_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `patient_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose_code` text NOT NULL,
	`policy_id` text NOT NULL,
	`policy_version` integer NOT NULL,
	`status` text DEFAULT 'granted' NOT NULL,
	`acknowledgement_code` text NOT NULL,
	`granted_at` integer NOT NULL,
	`withdrawn_at` integer,
	`withdrawal_reason_code` text,
	`resource_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`policy_id`) REFERENCES `consent_policies`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_patient_consents_user_purpose_status` ON `patient_consents` (`user_id`,`purpose_code`,`status`);--> statement-breakpoint
CREATE INDEX `idx_patient_consents_policy_status` ON `patient_consents` (`policy_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_patient_consents_status_updated` ON `patient_consents` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `personal_health_profile_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'active' NOT NULL,
	`source_label` text DEFAULT 'user_entered_unverified' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`removed_at` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `personal_health_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_personal_health_profile_entries_owner_status` ON `personal_health_profile_entries` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_personal_health_profile_entries_profile_category` ON `personal_health_profile_entries` (`profile_id`,`category`,`status`);--> statement-breakpoint
CREATE TABLE `personal_health_profile_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`entry_id` text,
	`action` text NOT NULL,
	`category` text,
	`profile_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`profile_id`) REFERENCES `personal_health_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_personal_health_profile_events_user_created` ON `personal_health_profile_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `personal_health_profile_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`profiles_changed` integer NOT NULL,
	`entries_changed` integer NOT NULL,
	`providers_notified` integer NOT NULL,
	`clinical_actions_triggered` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_personal_health_profile_rehearsals_executed` ON `personal_health_profile_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `personal_health_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`active_entry_count` integer DEFAULT 0 NOT NULL,
	`removed_entry_count` integer DEFAULT 0 NOT NULL,
	`source_label` text DEFAULT 'user_entered_unverified' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_personal_health_profiles_user` ON `personal_health_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_personal_health_profiles_status_updated` ON `personal_health_profiles` (`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
