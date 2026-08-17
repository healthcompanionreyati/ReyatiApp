CREATE TABLE `partner_access_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`subject_reference` text NOT NULL,
	`partner_role` text NOT NULL,
	`location_scopes_json` text DEFAULT '[]' NOT NULL,
	`mfa_evidence_status` text DEFAULT 'not_verified' NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `partner_onboarding_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_partner_access_org_status` ON `partner_access_scopes` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_partner_access_profile` ON `partner_access_scopes` (`profile_id`);--> statement-breakpoint
CREATE TABLE `partner_governance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text,
	`organization_id` text,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_status` text,
	`next_status` text,
	`reason_code` text,
	`profile_version` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `partner_onboarding_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_partner_governance_events_profile` ON `partner_governance_events` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `partner_governance_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`organizations_activated` integer NOT NULL,
	`roles_granted` integer NOT NULL,
	`money_moved` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_partner_governance_rehearsals_executed` ON `partner_governance_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `partner_onboarding_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`partner_type` text NOT NULL,
	`registration_reference` text NOT NULL,
	`licence_reference` text NOT NULL,
	`licence_expires_at` integer NOT NULL,
	`service_areas_json` text NOT NULL,
	`operating_hours_json` text NOT NULL,
	`fulfilment_modes_json` text NOT NULL,
	`evidence_references_json` text NOT NULL,
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
CREATE UNIQUE INDEX `idx_partner_onboarding_org_version` ON `partner_onboarding_profiles` (`organization_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_partner_onboarding_status_updated` ON `partner_onboarding_profiles` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `partner_settlement_events` (
	`id` text PRIMARY KEY NOT NULL,
	`statement_id` text,
	`organization_id` text,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_status` text,
	`next_status` text,
	`statement_version` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`statement_id`) REFERENCES `partner_settlement_statements`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_partner_settlement_events_statement` ON `partner_settlement_events` (`statement_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `partner_settlement_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`statement_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`exception_code` text NOT NULL,
	`reference` text NOT NULL,
	`amount_minor` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution_code` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`statement_id`) REFERENCES `partner_settlement_statements`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_partner_settlement_exceptions_statement` ON `partner_settlement_exceptions` (`statement_id`,`status`);--> statement-breakpoint
CREATE TABLE `partner_settlement_statements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`currency` text DEFAULT 'QAR' NOT NULL,
	`gross_minor` integer NOT NULL,
	`refund_minor` integer NOT NULL,
	`commission_minor` integer NOT NULL,
	`net_minor` integer NOT NULL,
	`ledger_reference` text NOT NULL,
	`source_freshness_at` integer NOT NULL,
	`reconciliation_status` text NOT NULL,
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
CREATE UNIQUE INDEX `idx_partner_settlement_org_period` ON `partner_settlement_statements` (`organization_id`,`period_start`,`period_end`);--> statement-breakpoint
CREATE INDEX `idx_partner_settlement_status_updated` ON `partner_settlement_statements` (`status`,`updated_at`);
--> statement-breakpoint
PRAGMA optimize;
