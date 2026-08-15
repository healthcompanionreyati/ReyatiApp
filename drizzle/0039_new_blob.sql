CREATE TABLE `pilot_participation_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`participant_type` text NOT NULL,
	`invitation_policy_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`access_revocation_target_minutes` integer NOT NULL,
	`acknowledgement_target_hours` integer NOT NULL,
	`support_followup_hours` integer NOT NULL,
	`withdrawal_method` text DEFAULT 'authenticated_self_service_and_support' NOT NULL,
	`record_treatment` text DEFAULT 'preserve_required_records' NOT NULL,
	`reactivation_mode` text DEFAULT 'new_invitation_and_fresh_acceptance' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `controlled_pilot_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`invitation_policy_id`) REFERENCES `pilot_invitation_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pilot_participation_policy_plan_type_version` ON `pilot_participation_policies` (`plan_id`,`participant_type`,`policy_version`);--> statement-breakpoint
CREATE INDEX `idx_pilot_participation_policy_plan_type_status` ON `pilot_participation_policies` (`plan_id`,`participant_type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_pilot_participation_policy_invitation_status` ON `pilot_participation_policies` (`invitation_policy_id`,`status`);--> statement-breakpoint
CREATE TABLE `pilot_participation_policy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `pilot_participation_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_participation_policy_events_policy_created` ON `pilot_participation_policy_events` (`policy_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_withdrawal_drill_events` (
	`id` text PRIMARY KEY NOT NULL,
	`drill_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`drill_id`) REFERENCES `pilot_withdrawal_drills`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_withdrawal_drill_events_drill_created` ON `pilot_withdrawal_drill_events` (`drill_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_withdrawal_drills` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`scenario` text NOT NULL,
	`synthetic_reference` text NOT NULL,
	`revocation_minutes` integer NOT NULL,
	`acknowledgement_minutes` integer NOT NULL,
	`open_action_count` integer NOT NULL,
	`result` text NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`run_by_user_id` text NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `pilot_participation_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`run_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pilot_withdrawal_drill_policy_reference` ON `pilot_withdrawal_drills` (`policy_id`,`synthetic_reference`);--> statement-breakpoint
CREATE INDEX `idx_pilot_withdrawal_drill_policy_status_created` ON `pilot_withdrawal_drills` (`policy_id`,`status`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
