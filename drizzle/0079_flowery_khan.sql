CREATE TABLE `api_client_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`client_reference` text NOT NULL,
	`organization_reference` text NOT NULL,
	`workload_class` text NOT NULL,
	`scope_profile` text NOT NULL,
	`credential_state` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_api_client_status` ON `api_client_proposals` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `integration_assurance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`module` text NOT NULL,
	`record_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_assurance_events` ON `integration_assurance_events` (`module`,`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_assurance_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`credentials_issued` integer NOT NULL,
	`webhooks_activated` integer NOT NULL,
	`partners_certified` integer NOT NULL,
	`terminology_published` integer NOT NULL,
	`patients_merged` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_assurance_rehearsal` ON `integration_assurance_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `partner_conformance_certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`certificate_reference` text NOT NULL,
	`partner_reference` text NOT NULL,
	`contract_profile` text NOT NULL,
	`test_band` text NOT NULL,
	`evidence_state` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_partner_conformance_status` ON `partner_conformance_certificates` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `patient_match_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`exception_reference` text NOT NULL,
	`source_reference` text NOT NULL,
	`ambiguity_code` text NOT NULL,
	`risk_band` text NOT NULL,
	`review_disposition` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_patient_match_exception_status` ON `patient_match_exceptions` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `terminology_set_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`set_reference` text NOT NULL,
	`terminology_system` text NOT NULL,
	`clinical_domain` text NOT NULL,
	`review_state` text NOT NULL,
	`exception_band` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_terminology_set_status` ON `terminology_set_proposals` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `webhook_endpoint_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint_reference` text NOT NULL,
	`connection_reference` text NOT NULL,
	`event_family` text NOT NULL,
	`signature_profile` text NOT NULL,
	`verification_state` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_webhook_endpoint_status` ON `webhook_endpoint_proposals` (`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
