CREATE TABLE `pilot_invitation_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`participant_type` text NOT NULL,
	`enrollment_document_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`expiry_hours` integer NOT NULL,
	`max_reissues` integer NOT NULL,
	`identity_binding` text DEFAULT 'account_email_and_user' NOT NULL,
	`token_storage_mode` text DEFAULT 'hash_only' NOT NULL,
	`single_use_required` integer DEFAULT true NOT NULL,
	`acceptance_locale_required` integer DEFAULT true NOT NULL,
	`withdrawal_enabled` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `controlled_pilot_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`enrollment_document_id`) REFERENCES `pilot_enrollment_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pilot_invitation_policy_plan_type_version` ON `pilot_invitation_policies` (`plan_id`,`participant_type`,`policy_version`);--> statement-breakpoint
CREATE INDEX `idx_pilot_invitation_policy_plan_type_status` ON `pilot_invitation_policies` (`plan_id`,`participant_type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_pilot_invitation_policy_document_status` ON `pilot_invitation_policies` (`enrollment_document_id`,`status`);--> statement-breakpoint
CREATE TABLE `pilot_invitation_policy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `pilot_invitation_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_invitation_policy_events_policy_created` ON `pilot_invitation_policy_events` (`policy_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
