CREATE TABLE `monitoring_acceptance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`acceptance_run_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`acceptance_run_id`) REFERENCES `monitoring_acceptance_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_monitoring_acceptance_events_run_created` ON `monitoring_acceptance_events` (`acceptance_run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `monitoring_acceptance_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`environment` text DEFAULT 'production' NOT NULL,
	`platform` text DEFAULT 'vercel_first_party' NOT NULL,
	`data_classification` text DEFAULT 'synthetic_only' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`sample_window_started_at` integer NOT NULL,
	`sample_window_ended_at` integer NOT NULL,
	`evidence_reference` text NOT NULL,
	`approved_policy_count` integer NOT NULL,
	`fresh_validation_count` integer NOT NULL,
	`runtime_logs_available` integer DEFAULT false NOT NULL,
	`web_analytics_configured` integer DEFAULT false NOT NULL,
	`speed_insights_configured` integer DEFAULT false NOT NULL,
	`security_alert_route_verified` integer DEFAULT false NOT NULL,
	`prohibited_fields_detected` integer DEFAULT 0 NOT NULL,
	`external_systems_contacted` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitoring_acceptance_reference` ON `monitoring_acceptance_runs` (`reference`);--> statement-breakpoint
CREATE INDEX `idx_monitoring_acceptance_status_created` ON `monitoring_acceptance_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_monitoring_acceptance_reviewed` ON `monitoring_acceptance_runs` (`status`,`reviewed_at`);