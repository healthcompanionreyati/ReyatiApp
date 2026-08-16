CREATE TABLE `care_navigator_evaluation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_set_id` text NOT NULL,
	`suite_version` text NOT NULL,
	`total_scenarios` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`critical_failures` integer NOT NULL,
	`emergency_recall_bps` integer NOT NULL,
	`route_accuracy_bps` integer NOT NULL,
	`bilingual_parity_bps` integer NOT NULL,
	`result` text NOT NULL,
	`failures_json` text DEFAULT '[]' NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`rule_set_id`) REFERENCES `care_navigator_rule_sets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_navigator_runs_ruleset_executed` ON `care_navigator_evaluation_runs` (`rule_set_id`,`executed_at`);--> statement-breakpoint
CREATE INDEX `idx_care_navigator_runs_result_executed` ON `care_navigator_evaluation_runs` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `care_navigator_evaluation_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_set_id` text NOT NULL,
	`scenario_key` text NOT NULL,
	`locale` text NOT NULL,
	`risk_class` text NOT NULL,
	`input_json` text NOT NULL,
	`expected_outcome` text NOT NULL,
	`expected_specialty` text,
	`source_reference` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rule_set_id`) REFERENCES `care_navigator_rule_sets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_navigator_scenarios_ruleset_key` ON `care_navigator_evaluation_scenarios` (`rule_set_id`,`scenario_key`);--> statement-breakpoint
CREATE INDEX `idx_care_navigator_scenarios_ruleset_risk` ON `care_navigator_evaluation_scenarios` (`rule_set_id`,`risk_class`);--> statement-breakpoint
CREATE TABLE `care_navigator_rule_set_events` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_set_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rule_set_id`) REFERENCES `care_navigator_rule_sets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_navigator_rule_events_ruleset_created` ON `care_navigator_rule_set_events` (`rule_set_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `care_navigator_rule_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`ruleset_version` text NOT NULL,
	`label` text NOT NULL,
	`source_reference` text NOT NULL,
	`emergency_rule_count` integer NOT NULL,
	`route_rule_count` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`clinical_approval_status` text DEFAULT 'not_reviewed' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_navigator_rule_sets_version` ON `care_navigator_rule_sets` (`ruleset_version`);--> statement-breakpoint
CREATE INDEX `idx_care_navigator_rule_sets_status_updated` ON `care_navigator_rule_sets` (`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
