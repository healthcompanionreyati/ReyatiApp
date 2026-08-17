CREATE TABLE `provider_comparison_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`provider_ids_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_provider_comparisons_user_status_updated` ON `provider_comparison_sessions` (`user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `saved_care_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_saved_care_events_user_created` ON `saved_care_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `saved_care_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`favourites_created` integer NOT NULL,
	`comparisons_created` integer NOT NULL,
	`provider_notifications_sent` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_saved_care_rehearsals_executed` ON `saved_care_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `saved_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_saved_providers_user_provider` ON `saved_providers` (`user_id`,`provider_id`);--> statement-breakpoint
CREATE INDEX `idx_saved_providers_user_status_updated` ON `saved_providers` (`user_id`,`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
