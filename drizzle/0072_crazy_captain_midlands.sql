CREATE TABLE `clinical_privilege_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workforce_credential_id` text NOT NULL,
	`facility_id` text,
	`privilege_code` text NOT NULL,
	`service_scope_json` text DEFAULT '[]' NOT NULL,
	`supervision_level` text NOT NULL,
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
	FOREIGN KEY (`workforce_credential_id`) REFERENCES `workforce_credential_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_clinical_privileges_org_status` ON `clinical_privilege_proposals` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_clinical_privileges_credential` ON `clinical_privilege_proposals` (`workforce_credential_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_clinical_privileges_effective` ON `clinical_privilege_proposals` (`effective_from`,`effective_to`);--> statement-breakpoint
CREATE TABLE `workforce_credential_records` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`staff_reference` text NOT NULL,
	`workforce_category` text NOT NULL,
	`authority_name` text NOT NULL,
	`credential_reference` text NOT NULL,
	`scope_label` text NOT NULL,
	`evidence_references_json` text DEFAULT '[]' NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`prior_record_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`review_reason_code` text,
	`affected_privilege_count` integer DEFAULT 0 NOT NULL,
	`impact_previewed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_workforce_credentials_org_status` ON `workforce_credential_records` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_workforce_credentials_expiry` ON `workforce_credential_records` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_workforce_credentials_staff` ON `workforce_credential_records` (`organization_id`,`staff_reference`);--> statement-breakpoint
CREATE TABLE `workforce_governance_events` (
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
CREATE INDEX `idx_workforce_events_resource_created` ON `workforce_governance_events` (`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workforce_governance_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`runtime_credential_changes` integer NOT NULL,
	`runtime_privilege_changes` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_workforce_rehearsals_executed` ON `workforce_governance_rehearsals` (`executed_at`);--> statement-breakpoint
PRAGMA optimize;
