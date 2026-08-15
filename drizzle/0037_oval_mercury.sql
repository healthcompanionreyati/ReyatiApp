CREATE TABLE `pilot_feedback_events` (
	`id` text PRIMARY KEY NOT NULL,
	`feedback_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`feedback_id`) REFERENCES `pilot_feedback_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_feedback_events_feedback_created` ON `pilot_feedback_events` (`feedback_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_feedback_items` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`persona` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`summary` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`recorded_by_user_id` text NOT NULL,
	`closed_by_user_id` text,
	`resolution_note` text,
	`closed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `controlled_pilot_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_feedback_plan_status_created` ON `pilot_feedback_items` (`plan_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_pilot_feedback_plan_category` ON `pilot_feedback_items` (`plan_id`,`category`);--> statement-breakpoint
CREATE TABLE `pilot_success_metric_events` (
	`id` text PRIMARY KEY NOT NULL,
	`metric_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`metric_id`) REFERENCES `pilot_success_metrics`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_success_metric_events_metric_created` ON `pilot_success_metric_events` (`metric_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_success_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`metric_key` text NOT NULL,
	`definition_version` text NOT NULL,
	`label` text NOT NULL,
	`definition` text NOT NULL,
	`unit` text NOT NULL,
	`direction` text NOT NULL,
	`target_value` integer NOT NULL,
	`minimum_sample_size` integer NOT NULL,
	`evidence_source` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `controlled_pilot_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pilot_success_metrics_plan_key_version` ON `pilot_success_metrics` (`plan_id`,`metric_key`,`definition_version`);--> statement-breakpoint
CREATE INDEX `idx_pilot_success_metrics_plan_key_status` ON `pilot_success_metrics` (`plan_id`,`metric_key`,`status`);--> statement-breakpoint
CREATE INDEX `idx_pilot_success_metrics_plan_status` ON `pilot_success_metrics` (`plan_id`,`status`);--> statement-breakpoint
PRAGMA optimize;
