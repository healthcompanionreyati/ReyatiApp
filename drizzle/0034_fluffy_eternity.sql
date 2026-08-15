CREATE TABLE `controlled_pilot_plan_events` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `controlled_pilot_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_controlled_pilot_plan_events_plan_created` ON `controlled_pilot_plan_events` (`plan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `controlled_pilot_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`clinic_label` text NOT NULL,
	`planned_start_at` integer NOT NULL,
	`planned_end_at` integer NOT NULL,
	`provider_target` integer NOT NULL,
	`patient_target` integer NOT NULL,
	`invitation_only` integer DEFAULT true NOT NULL,
	`public_registration_enabled` integer DEFAULT false NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`activated_at` integer,
	`readiness_review_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`readiness_review_id`) REFERENCES `pilot_readiness_reviews`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_controlled_pilot_plans_organization` ON `controlled_pilot_plans` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_controlled_pilot_plans_status_updated` ON `controlled_pilot_plans` (`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
