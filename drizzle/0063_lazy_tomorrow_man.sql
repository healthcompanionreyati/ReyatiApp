CREATE TABLE `emergency_profile_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_visibility` text,
	`next_visibility` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`profile_id`) REFERENCES `emergency_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_emergency_profile_events_user_created` ON `emergency_profile_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `emergency_profile_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`profiles_changed` integer NOT NULL,
	`providers_notified` integer NOT NULL,
	`emergency_services_contacted` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_emergency_profile_rehearsals_executed` ON `emergency_profile_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `emergency_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`blood_group` text,
	`allergies_json` text DEFAULT '[]' NOT NULL,
	`conditions_json` text DEFAULT '[]' NOT NULL,
	`medicines_json` text DEFAULT '[]' NOT NULL,
	`emergency_contact_json` text,
	`item_count` integer DEFAULT 0 NOT NULL,
	`has_emergency_contact` integer DEFAULT false NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`consent_status` text DEFAULT 'not_granted' NOT NULL,
	`consented_at` integer,
	`source_label` text DEFAULT 'user_entered_unverified' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_emergency_profiles_user` ON `emergency_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_emergency_profiles_visibility_updated` ON `emergency_profiles` (`visibility`,`updated_at`);--> statement-breakpoint
CREATE TABLE `health_content_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`retirement_requested_by_user_id` text,
	`retirement_reason` text,
	`retired_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`retirement_requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_health_content_articles_slug` ON `health_content_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_health_content_articles_status_category_updated` ON `health_content_articles` (`status`,`category`,`updated_at`);--> statement-breakpoint
CREATE TABLE `health_content_events` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`version_id` text,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `health_content_articles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`version_id`) REFERENCES `health_content_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_health_content_events_article_created` ON `health_content_events` (`article_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `health_content_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`articles_created` integer NOT NULL,
	`articles_published` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_health_content_rehearsals_executed` ON `health_content_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `health_content_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`label` text NOT NULL,
	`publisher` text NOT NULL,
	`url` text NOT NULL,
	`accessed_on` text NOT NULL,
	`display_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `health_content_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_health_content_sources_version_order` ON `health_content_sources` (`version_id`,`display_order`);--> statement-breakpoint
CREATE TABLE `health_content_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title_en` text NOT NULL,
	`title_ar` text NOT NULL,
	`summary_en` text NOT NULL,
	`summary_ar` text NOT NULL,
	`body_en` text NOT NULL,
	`body_ar` text NOT NULL,
	`author_name` text NOT NULL,
	`author_credentials` text NOT NULL,
	`author_user_id` text NOT NULL,
	`medical_reviewer_name` text,
	`medical_reviewer_credentials` text,
	`medical_reviewer_user_id` text,
	`reviewed_at` integer,
	`approved_by_user_id` text,
	`approved_at` integer,
	`published_at` integer,
	`change_summary` text NOT NULL,
	`review_notes` text,
	`correction_notice_en` text,
	`correction_notice_ar` text,
	`evidence_reviewed_through` text NOT NULL,
	`next_review_due_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `health_content_articles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`medical_reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_health_content_versions_article_number` ON `health_content_versions` (`article_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `idx_health_content_versions_article_status_updated` ON `health_content_versions` (`article_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_health_content_versions_review_due` ON `health_content_versions` (`status`,`next_review_due_at`);--> statement-breakpoint
CREATE TABLE `privacy_rights_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_scope` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`resource_version` integer NOT NULL,
	`reason_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `privacy_rights_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_privacy_rights_events_request_created` ON `privacy_rights_events` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `privacy_rights_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`requests_created` integer DEFAULT 0 NOT NULL,
	`exports_delivered` integer DEFAULT 0 NOT NULL,
	`records_deleted` integer DEFAULT 0 NOT NULL,
	`accounts_closed` integer DEFAULT 0 NOT NULL,
	`external_submissions_sent` integer DEFAULT 0 NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_privacy_rights_rehearsals_executed` ON `privacy_rights_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `privacy_rights_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_type` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`assigned_to_user_id` text,
	`latest_submission_id` text NOT NULL,
	`decision_code` text,
	`completion_reference` text,
	`submitted_at` integer NOT NULL,
	`closed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_privacy_rights_user_status_updated` ON `privacy_rights_requests` (`user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_privacy_rights_status_type_updated` ON `privacy_rights_requests` (`status`,`request_type`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_privacy_rights_assignee_status` ON `privacy_rights_requests` (`assigned_to_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `privacy_rights_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`submitted_by_user_id` text NOT NULL,
	`submission_type` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `privacy_rights_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_privacy_rights_submissions_request_created` ON `privacy_rights_submissions` (`request_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
