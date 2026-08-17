CREATE TABLE `account_security_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`action` text NOT NULL,
	`target_session_id` text,
	`result_status` text NOT NULL,
	`affected_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_account_security_commands_owner_request` ON `account_security_commands` (`user_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `account_security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`session_id` text,
	`event_type` text NOT NULL,
	`outcome` text NOT NULL,
	`reason_code` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`session_id`) REFERENCES `account_security_sessions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_account_security_events_owner_occurred` ON `account_security_events` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_account_security_events_type_occurred` ON `account_security_events` (`event_type`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `account_security_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`sessions_changed` integer DEFAULT 0 NOT NULL,
	`identity_provider_calls` integer DEFAULT 0 NOT NULL,
	`lockouts_triggered` integer DEFAULT 0 NOT NULL,
	`external_risk_requests` integer DEFAULT 0 NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_account_security_rehearsals_executed` ON `account_security_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `account_security_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_binding_hash` text NOT NULL,
	`device_label` text NOT NULL,
	`platform_family` text NOT NULL,
	`browser_family` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`resource_version` integer DEFAULT 1 NOT NULL,
	`last_active_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`revoked_reason_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_account_security_sessions_binding` ON `account_security_sessions` (`user_id`,`device_binding_hash`);--> statement-breakpoint
CREATE INDEX `idx_account_security_sessions_owner_status_activity` ON `account_security_sessions` (`user_id`,`status`,`last_active_at`);--> statement-breakpoint
CREATE INDEX `idx_account_security_sessions_status_expiry` ON `account_security_sessions` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `catalogue_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`depends_on_item_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `catalogue_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`depends_on_item_id`) REFERENCES `catalogue_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_catalogue_dependencies_pair` ON `catalogue_dependencies` (`item_id`,`depends_on_item_id`);--> statement-breakpoint
CREATE INDEX `idx_catalogue_dependencies_target` ON `catalogue_dependencies` (`depends_on_item_id`);--> statement-breakpoint
CREATE TABLE `catalogue_events` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action_code` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`reason_code` text,
	`item_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `catalogue_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_catalogue_events_item_created` ON `catalogue_events` (`item_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `catalogue_items` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`code` text NOT NULL,
	`label_en` text NOT NULL,
	`label_ar` text NOT NULL,
	`description_en` text NOT NULL,
	`description_ar` text NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`authored_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_decision` text,
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
CREATE UNIQUE INDEX `idx_catalogue_items_category_code` ON `catalogue_items` (`category`,`code`);--> statement-breakpoint
CREATE INDEX `idx_catalogue_items_category_status_sort` ON `catalogue_items` (`category`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_catalogue_items_status_updated` ON `catalogue_items` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `catalogue_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`records_created` integer NOT NULL,
	`records_activated` integer NOT NULL,
	`records_retired` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_catalogue_rehearsals_executed` ON `catalogue_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `notification_category_preferences` (
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`channel` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`mandatory_reason_code` text,
	`resource_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `category`, `channel`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notification_category_preferences_user_category` ON `notification_category_preferences` (`user_id`,`category`);--> statement-breakpoint
CREATE INDEX `idx_notification_category_preferences_category_channel_enabled` ON `notification_category_preferences` (`category`,`channel`,`enabled`);--> statement-breakpoint
CREATE TABLE `notification_preference_events` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_user_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_scope` text NOT NULL,
	`action` text NOT NULL,
	`category` text,
	`channel` text,
	`previous_enabled` integer,
	`next_enabled` integer,
	`profile_version` integer NOT NULL,
	`preference_version` integer,
	`reason_code` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`subject_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_notification_preference_events_subject_occurred` ON `notification_preference_events` (`subject_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_notification_preference_events_action_occurred` ON `notification_preference_events` (`action`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `notification_preference_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`preferred_locale` text DEFAULT 'en' NOT NULL,
	`timezone` text DEFAULT 'Asia/Qatar' NOT NULL,
	`quiet_hours_enabled` integer DEFAULT false NOT NULL,
	`quiet_hours_start` text DEFAULT '22:00' NOT NULL,
	`quiet_hours_end` text DEFAULT '07:00' NOT NULL,
	`resource_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notification_preference_profiles_updated` ON `notification_preference_profiles` (`updated_at`);--> statement-breakpoint
CREATE TABLE `notification_preference_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`preferences_changed` integer DEFAULT 0 NOT NULL,
	`messages_delivered` integer DEFAULT 0 NOT NULL,
	`external_synchronizations` integer DEFAULT 0 NOT NULL,
	`clinical_personalizations` integer DEFAULT 0 NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_notification_preference_rehearsals_executed` ON `notification_preference_rehearsals` (`executed_at`);
--> statement-breakpoint
PRAGMA optimize;
