CREATE TABLE `care_navigator_assessment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`decision` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `care_navigator_assessments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_navigator_events_assessment_created` ON `care_navigator_assessment_events` (`assessment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `care_navigator_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`locale` text NOT NULL,
	`consent_version` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`concern_category` text NOT NULL,
	`duration_band` text NOT NULL,
	`age_group` text NOT NULL,
	`care_mode_preference` text NOT NULL,
	`red_flags_json` text NOT NULL,
	`outcome` text NOT NULL,
	`recommended_specialty` text,
	`recommended_care_mode` text,
	`rationale_code` text NOT NULL,
	`preparation_questions_json` text NOT NULL,
	`provider_ids_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'presented' NOT NULL,
	`decision` text,
	`decided_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_navigator_assessments_user_created` ON `care_navigator_assessments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_care_navigator_assessments_outcome_created` ON `care_navigator_assessments` (`outcome`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
