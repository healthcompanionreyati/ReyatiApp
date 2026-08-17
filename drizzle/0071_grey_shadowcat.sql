CREATE TABLE `organization_location_verification_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`facility_id` text,
	`verification_kind` text NOT NULL,
	`authority_name` text NOT NULL,
	`registration_reference` text NOT NULL,
	`evidence_references_json` text DEFAULT '[]' NOT NULL,
	`expires_at` integer NOT NULL,
	`prior_submission_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_reason_code` text,
	`affected_provider_count` integer DEFAULT 0 NOT NULL,
	`affected_service_count` integer DEFAULT 0 NOT NULL,
	`impact_previewed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_org_location_verification_org_status` ON `organization_location_verification_submissions` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_org_location_verification_expiry` ON `organization_location_verification_submissions` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `provider_credential_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`authority_name` text NOT NULL,
	`licence_reference` text NOT NULL,
	`specialty_scope` text NOT NULL,
	`affiliation_reference` text NOT NULL,
	`evidence_references_json` text DEFAULT '[]' NOT NULL,
	`expires_at` integer NOT NULL,
	`prior_submission_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_reason_code` text,
	`affected_service_count` integer DEFAULT 0 NOT NULL,
	`impact_previewed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_provider_credentials_provider_status` ON `provider_credential_submissions` (`provider_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_provider_credentials_expiry` ON `provider_credential_submissions` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `verification_lifecycle_events` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`organization_id` text NOT NULL,
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
CREATE INDEX `idx_verification_events_resource_created` ON `verification_lifecycle_events` (`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `verification_lifecycle_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`runtime_records_changed` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`evidence_files_uploaded` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_verification_rehearsals_executed` ON `verification_lifecycle_rehearsals` (`executed_at`);--> statement-breakpoint
PRAGMA optimize;
