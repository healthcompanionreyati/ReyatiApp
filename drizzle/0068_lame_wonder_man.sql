CREATE TABLE `service_status_events` (
	`id` text PRIMARY KEY NOT NULL,
	`notice_id` text,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_status` text,
	`next_status` text,
	`notice_version` integer,
	`metadata_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`notice_id`) REFERENCES `service_status_notices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_service_status_events_notice_created` ON `service_status_events` (`notice_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `service_status_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`component` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title_en` text NOT NULL,
	`title_ar` text NOT NULL,
	`summary_en` text NOT NULL,
	`summary_ar` text NOT NULL,
	`impact_en` text NOT NULL,
	`impact_ar` text NOT NULL,
	`guidance_en` text NOT NULL,
	`guidance_ar` text NOT NULL,
	`started_at` integer NOT NULL,
	`next_update_at` integer,
	`resolved_at` integer,
	`prepared_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`published_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_service_status_notices_status_updated` ON `service_status_notices` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_service_status_notices_component_status` ON `service_status_notices` (`component`,`status`);--> statement-breakpoint
CREATE INDEX `idx_service_status_notices_next_update` ON `service_status_notices` (`status`,`next_update_at`);--> statement-breakpoint
CREATE TABLE `service_status_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`notices_created` integer NOT NULL,
	`notices_published` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`sensitive_details_disclosed` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_service_status_rehearsals_executed` ON `service_status_rehearsals` (`executed_at`);
--> statement-breakpoint
PRAGMA optimize;
