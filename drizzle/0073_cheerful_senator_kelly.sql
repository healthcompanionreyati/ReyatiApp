CREATE TABLE `provider_coverage_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`leave_plan_id` text NOT NULL,
	`original_provider_id` text NOT NULL,
	`replacement_provider_id` text NOT NULL,
	`facility_id` text,
	`service_scopes_json` text DEFAULT '[]' NOT NULL,
	`handover_reference` text NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_to` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_reason_code` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`leave_plan_id`) REFERENCES `provider_leave_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`original_provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`replacement_provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_provider_coverage_org_status` ON `provider_coverage_assignments` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_provider_coverage_leave` ON `provider_coverage_assignments` (`leave_plan_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_provider_coverage_replacement_window` ON `provider_coverage_assignments` (`replacement_provider_id`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE TABLE `provider_coverage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_status` text,
	`next_status` text,
	`reason_code` text,
	`resource_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_provider_coverage_events_resource` ON `provider_coverage_events` (`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `provider_coverage_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`appointments_changed` integer NOT NULL,
	`schedules_changed` integer NOT NULL,
	`notifications_sent` integer NOT NULL,
	`runtime_assignments_created` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_provider_coverage_rehearsals_executed` ON `provider_coverage_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `provider_leave_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`leave_type` text NOT NULL,
	`reason_code` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`affected_appointment_count` integer DEFAULT 0 NOT NULL,
	`impact_previewed_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_reason_code` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_provider_leave_org_status` ON `provider_leave_plans` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_provider_leave_provider_window` ON `provider_leave_plans` (`provider_id`,`starts_at`,`ends_at`);--> statement-breakpoint
PRAGMA optimize;
