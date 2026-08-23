CREATE TABLE `payment_go_live_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`framework_version` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_mode` text NOT NULL,
	`acceptance_run_id` text,
	`rehearsal_run_id` text,
	`reconciliation_run_id` text,
	`status` text NOT NULL,
	`check_count` integer NOT NULL,
	`passed_checks` integer NOT NULL,
	`failed_checks` integer NOT NULL,
	`check_results_json` text NOT NULL,
	`decision` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_user_id` text,
	`review_note` text,
	`reviewed_at` integer,
	`money_movement_minor` integer DEFAULT 0 NOT NULL,
	`operational_changes_executed` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`prepared_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`acceptance_run_id`) REFERENCES `payment_acceptance_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rehearsal_run_id`) REFERENCES `payment_lifecycle_rehearsals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reconciliation_run_id`) REFERENCES `payment_reconciliation_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_go_live_request` ON `payment_go_live_reviews` (`prepared_by_user_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_go_live_status_prepared` ON `payment_go_live_reviews` (`status`,`decision`,`prepared_at`);