CREATE TABLE `payment_activation_assurance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`assurance_run_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_decision` text,
	`next_decision` text NOT NULL,
	`coded_details_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assurance_run_id`) REFERENCES `payment_activation_assurance_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_payment_assurance_event_run_created` ON `payment_activation_assurance_events` (`assurance_run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_assurance_event_code_created` ON `payment_activation_assurance_events` (`event_code`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_activation_assurance_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`activation_window_id` text NOT NULL,
	`collected_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`framework_version` text NOT NULL,
	`provider_mode` text NOT NULL,
	`observation_started_at` integer NOT NULL,
	`observation_ended_at` integer NOT NULL,
	`minimum_observation_ended_at` integer NOT NULL,
	`status` text NOT NULL,
	`check_count` integer NOT NULL,
	`passed_checks` integer NOT NULL,
	`failed_checks` integer NOT NULL,
	`check_results_json` text NOT NULL,
	`processor_event_count` integer DEFAULT 0 NOT NULL,
	`failed_processor_event_count` integer DEFAULT 0 NOT NULL,
	`stale_processor_event_count` integer DEFAULT 0 NOT NULL,
	`refund_execution_count` integer DEFAULT 0 NOT NULL,
	`failed_refund_execution_count` integer DEFAULT 0 NOT NULL,
	`reconciliation_run_id` text,
	`decision` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_user_id` text,
	`review_note` text,
	`reviewed_at` integer,
	`containment_verified_by_user_id` text,
	`containment_verified_at` integer,
	`configuration_read_count` integer DEFAULT 1 NOT NULL,
	`stripe_calls_made` integer DEFAULT 0 NOT NULL,
	`money_movement_minor` integer DEFAULT 0 NOT NULL,
	`operational_changes_executed` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`collected_at` integer NOT NULL,
	FOREIGN KEY (`activation_window_id`) REFERENCES `payment_activation_windows`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`collected_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reconciliation_run_id`) REFERENCES `payment_reconciliation_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`containment_verified_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_assurance_request` ON `payment_activation_assurance_runs` (`collected_by_user_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_assurance_window_collected` ON `payment_activation_assurance_runs` (`activation_window_id`,`collected_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_assurance_status_decision` ON `payment_activation_assurance_runs` (`status`,`decision`,`collected_at`);