CREATE TABLE `patient_profile_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`profiles_changed` integer DEFAULT 0 NOT NULL,
	`identities_mutated` integer DEFAULT 0 NOT NULL,
	`contacts_verified` integer DEFAULT 0 NOT NULL,
	`identities_disclosed` integer DEFAULT 0 NOT NULL,
	`external_synchronizations` integer DEFAULT 0 NOT NULL,
	`clinical_inferences` integer DEFAULT 0 NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_patient_profile_rehearsals_executed` ON `patient_profile_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `patient_profile_setting_events` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_user_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_scope` text NOT NULL,
	`action` text NOT NULL,
	`changed_codes_json` text NOT NULL,
	`profile_version` integer NOT NULL,
	`reason_code` text NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`subject_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_patient_profile_setting_events_subject_occurred` ON `patient_profile_setting_events` (`subject_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_patient_profile_setting_events_action_occurred` ON `patient_profile_setting_events` (`action`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `patient_profile_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`patient_profile_id` text NOT NULL,
	`reyati_display_name` text,
	`preferred_language` text DEFAULT 'en' NOT NULL,
	`timezone` text DEFAULT 'Asia/Qatar' NOT NULL,
	`contact_display_preference` text DEFAULT 'masked' NOT NULL,
	`emergency_contact_reference` text,
	`communication_support_needs` text,
	`completion_state` text DEFAULT 'in_progress' NOT NULL,
	`resource_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patient_profile_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_patient_profile_settings_patient_profile` ON `patient_profile_settings` (`patient_profile_id`);--> statement-breakpoint
CREATE INDEX `idx_patient_profile_settings_language_completion` ON `patient_profile_settings` (`preferred_language`,`completion_state`);--> statement-breakpoint
CREATE INDEX `idx_patient_profile_settings_updated` ON `patient_profile_settings` (`updated_at`);--> statement-breakpoint
CREATE TABLE `policy_template_events` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action_code` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`reason_code` text,
	`template_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `policy_templates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_policy_template_events_record_created` ON `policy_template_events` (`template_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `policy_template_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`template_records_changed` integer NOT NULL,
	`outbound_messages_sent` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_policy_template_rehearsals_executed` ON `policy_template_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `policy_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`template_code` text NOT NULL,
	`purpose` text NOT NULL,
	`edition` integer NOT NULL,
	`title_en` text NOT NULL,
	`title_ar` text NOT NULL,
	`body_en` text NOT NULL,
	`body_ar` text NOT NULL,
	`placeholder_codes_json` text DEFAULT '[]' NOT NULL,
	`effective_at` integer NOT NULL,
	`expires_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`authored_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_reason_code` text,
	`reviewed_at` integer,
	`activated_by_user_id` text,
	`activated_at` integer,
	`retired_by_user_id` text,
	`retirement_reason_code` text,
	`retired_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`authored_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`activated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`retired_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_policy_templates_code_edition` ON `policy_templates` (`template_code`,`edition`);--> statement-breakpoint
CREATE INDEX `idx_policy_templates_purpose_status` ON `policy_templates` (`purpose`,`status`);--> statement-breakpoint
CREATE INDEX `idx_policy_templates_status_effective` ON `policy_templates` (`status`,`effective_at`);--> statement-breakpoint
CREATE TABLE `tenant_configuration_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`locale` text NOT NULL,
	`timezone` text NOT NULL,
	`booking_horizon_days` integer NOT NULL,
	`cancellation_window_reference` text NOT NULL,
	`reminder_policy_reference` text NOT NULL,
	`support_contact_alias` text NOT NULL,
	`facility_display_default` text NOT NULL,
	`module_visibility_requests_json` text DEFAULT '[]' NOT NULL,
	`rationale` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_reason_code` text,
	`reviewed_at` integer,
	`retired_by_user_id` text,
	`retired_at` integer,
	`retirement_reason_code` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`retired_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_configuration_org_status` ON `tenant_configuration_drafts` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_tenant_configuration_status_updated` ON `tenant_configuration_drafts` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `tenant_configuration_events` (
	`id` text PRIMARY KEY NOT NULL,
	`configuration_id` text,
	`organization_id` text,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_status` text,
	`next_status` text,
	`reason_code` text,
	`configuration_version` integer,
	`evidence_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`configuration_id`) REFERENCES `tenant_configuration_drafts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_configuration_events_config_created` ON `tenant_configuration_events` (`configuration_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tenant_configuration_events_org_created` ON `tenant_configuration_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tenant_configuration_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`records_changed` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`runtime_changes` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_configuration_rehearsal_executed` ON `tenant_configuration_rehearsals` (`executed_at`);
--> statement-breakpoint
PRAGMA optimize;
