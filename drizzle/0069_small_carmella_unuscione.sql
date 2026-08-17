CREATE TABLE `provider_access_events` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text,
	`organization_id` text,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_status` text,
	`next_status` text,
	`reason_code` text,
	`proposal_version` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `provider_access_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_provider_access_events_proposal` ON `provider_access_events` (`proposal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `provider_access_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`subject_reference` text NOT NULL,
	`requested_role` text NOT NULL,
	`location_scopes_json` text DEFAULT '[]' NOT NULL,
	`purpose_code` text NOT NULL,
	`expires_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_reason_code` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_provider_access_org_status` ON `provider_access_proposals` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_provider_access_subject` ON `provider_access_proposals` (`organization_id`,`subject_reference`);--> statement-breakpoint
CREATE TABLE `provider_access_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`role_changes_applied` integer NOT NULL,
	`invitations_sent` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_provider_access_rehearsals_executed` ON `provider_access_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `scheduling_rule_events` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_set_id` text,
	`organization_id` text,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_status` text,
	`next_status` text,
	`rule_set_version` integer,
	`affected_appointment_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rule_set_id`) REFERENCES `scheduling_rule_sets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_scheduling_rule_events_rule` ON `scheduling_rule_events` (`rule_set_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `scheduling_rule_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`appointments_changed` integer NOT NULL,
	`slots_published` integer NOT NULL,
	`external_calendar_writes` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_scheduling_rule_rehearsals_executed` ON `scheduling_rule_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `scheduling_rule_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`service_location_id` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Qatar' NOT NULL,
	`weekly_rules_json` text NOT NULL,
	`exceptions_json` text DEFAULT '[]' NOT NULL,
	`booking_horizon_days` integer NOT NULL,
	`buffer_before_minutes` integer NOT NULL,
	`buffer_after_minutes` integer NOT NULL,
	`capacity` integer DEFAULT 1 NOT NULL,
	`confirmation_mode` text NOT NULL,
	`impact_appointment_count` integer DEFAULT 0 NOT NULL,
	`impact_previewed_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_reason_code` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`service_location_id`) REFERENCES `provider_service_locations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_scheduling_rules_org_status` ON `scheduling_rule_sets` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_scheduling_rules_location_status` ON `scheduling_rule_sets` (`service_location_id`,`status`);
--> statement-breakpoint
PRAGMA optimize;
