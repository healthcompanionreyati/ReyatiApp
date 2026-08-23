CREATE TABLE `payment_lifecycle_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`scenario_results_json` text NOT NULL,
	`stripe_calls_made` integer DEFAULT 0 NOT NULL,
	`r2_objects_written` integer DEFAULT 0 NOT NULL,
	`emails_sent` integer DEFAULT 0 NOT NULL,
	`money_movement_minor` integer DEFAULT 0 NOT NULL,
	`customer_records_created` integer DEFAULT 0 NOT NULL,
	`operational_records_created` integer DEFAULT 0 NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_lifecycle_rehearsal_request` ON `payment_lifecycle_rehearsals` (`requested_by_user_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_lifecycle_rehearsal_result_executed` ON `payment_lifecycle_rehearsals` (`result`,`executed_at`);
