CREATE TABLE `accessibility_setting_events` (
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
CREATE INDEX `idx_accessibility_setting_events_subject_occurred` ON `accessibility_setting_events` (`subject_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_accessibility_setting_events_action_occurred` ON `accessibility_setting_events` (`action`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `accessibility_setting_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`preferred_language` text DEFAULT 'en' NOT NULL,
	`text_size` text DEFAULT 'standard' NOT NULL,
	`contrast` text DEFAULT 'standard' NOT NULL,
	`reduced_motion` integer DEFAULT false NOT NULL,
	`screen_reader_assistance` integer DEFAULT false NOT NULL,
	`keyboard_assistance` integer DEFAULT false NOT NULL,
	`plain_language` integer DEFAULT false NOT NULL,
	`support_note` text,
	`resource_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_accessibility_setting_profiles_updated` ON `accessibility_setting_profiles` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_accessibility_setting_profiles_language_text_size` ON `accessibility_setting_profiles` (`preferred_language`,`text_size`);--> statement-breakpoint
CREATE TABLE `accessibility_setting_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`profiles_changed` integer DEFAULT 0 NOT NULL,
	`identities_disclosed` integer DEFAULT 0 NOT NULL,
	`clinical_adjustments` integer DEFAULT 0 NOT NULL,
	`external_synchronizations` integer DEFAULT 0 NOT NULL,
	`telemetry_transmissions` integer DEFAULT 0 NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_accessibility_setting_rehearsals_executed` ON `accessibility_setting_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `facility_directory_events` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action_code` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`reason_code` text,
	`profile_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `facility_directory_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_facility_directory_events_profile_created` ON `facility_directory_events` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `facility_directory_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`facility_id` text NOT NULL,
	`supersedes_profile_id` text,
	`name_en` text NOT NULL,
	`name_ar` text NOT NULL,
	`description_en` text NOT NULL,
	`description_ar` text NOT NULL,
	`address_en` text NOT NULL,
	`address_ar` text NOT NULL,
	`departments_json` text DEFAULT '[]' NOT NULL,
	`opening_hours_json` text DEFAULT '[]' NOT NULL,
	`accessibility_json` text DEFAULT '[]' NOT NULL,
	`parking_en` text NOT NULL,
	`parking_ar` text NOT NULL,
	`contact_phone` text NOT NULL,
	`contact_email` text NOT NULL,
	`services_json` text DEFAULT '[]' NOT NULL,
	`modes_json` text DEFAULT '[]' NOT NULL,
	`source_label` text DEFAULT 'provider_supplied_platform_reviewed' NOT NULL,
	`source_updated_at` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`authored_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_reason_code` text,
	`reviewed_at` integer,
	`published_by_user_id` text,
	`published_at` integer,
	`retired_by_user_id` text,
	`retired_at` integer,
	`retirement_reason_code` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`authored_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`published_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`retired_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_facility_directory_facility_status` ON `facility_directory_profiles` (`facility_id`,`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_facility_directory_org_status` ON `facility_directory_profiles` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `facility_directory_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`records_changed` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_facility_directory_rehearsals_executed` ON `facility_directory_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `release_control_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`proposal_version` integer,
	`previous_status` text,
	`next_status` text,
	`reason_code` text,
	`evidence_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `release_control_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_release_control_evidence_proposal_created` ON `release_control_evidence` (`proposal_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_release_control_evidence_event_created` ON `release_control_evidence` (`event_code`,`created_at`);--> statement-breakpoint
CREATE TABLE `release_control_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`capability_id` text NOT NULL,
	`target_environment` text NOT NULL,
	`proposed_state` integer NOT NULL,
	`owner` text NOT NULL,
	`rationale` text NOT NULL,
	`rollback_plan` text NOT NULL,
	`change_window_starts_at` integer NOT NULL,
	`change_window_ends_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_reason_code` text,
	`reviewed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_release_control_proposals_status_updated` ON `release_control_proposals` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_release_control_proposals_capability_environment` ON `release_control_proposals` (`capability_id`,`target_environment`);--> statement-breakpoint
CREATE INDEX `idx_release_control_proposals_expiry` ON `release_control_proposals` (`expires_at`);
--> statement-breakpoint
PRAGMA optimize;
