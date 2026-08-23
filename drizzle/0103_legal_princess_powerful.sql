CREATE TABLE `payment_acceptance_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`suite_version` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_mode` text NOT NULL,
	`provider_payment_intent_id` text NOT NULL,
	`provider_checkout_session_id` text,
	`provider_refund_id` text NOT NULL,
	`ledger_entry_id` text,
	`status` text NOT NULL,
	`check_count` integer NOT NULL,
	`passed_checks` integer NOT NULL,
	`failed_checks` integer NOT NULL,
	`check_results_json` text NOT NULL,
	`provider_read_count` integer DEFAULT 0 NOT NULL,
	`money_movement_minor` integer DEFAULT 0 NOT NULL,
	`side_effects_executed` integer DEFAULT false NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_user_id` text,
	`review_note` text,
	`reviewed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`collected_at` integer NOT NULL,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `payment_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_acceptance_request` ON `payment_acceptance_runs` (`requested_by_user_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_acceptance_intent_collected` ON `payment_acceptance_runs` (`provider_payment_intent_id`,`collected_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_acceptance_status_collected` ON `payment_acceptance_runs` (`status`,`review_status`,`collected_at`);
