CREATE TABLE `payment_reconciliation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`ledger_entry_id` text,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_balance_transaction_id` text NOT NULL,
	`provider_type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`fee_minor` integer NOT NULL,
	`net_minor` integer NOT NULL,
	`expected_amount_minor` integer,
	`currency` text NOT NULL,
	`match_status` text NOT NULL,
	`reason_code` text,
	`provider_created_at` integer NOT NULL,
	`provider_available_on` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `payment_reconciliation_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `payment_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_reconciliation_provider_transaction` ON `payment_reconciliation_items` (`run_id`,`provider`,`provider_balance_transaction_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_reconciliation_item_run_status` ON `payment_reconciliation_items` (`run_id`,`match_status`);--> statement-breakpoint
CREATE INDEX `idx_payment_reconciliation_item_ledger` ON `payment_reconciliation_items` (`ledger_entry_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_reconciliation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`window_start` integer NOT NULL,
	`window_end` integer NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`provider_item_count` integer DEFAULT 0 NOT NULL,
	`matched_item_count` integer DEFAULT 0 NOT NULL,
	`exception_item_count` integer DEFAULT 0 NOT NULL,
	`informational_item_count` integer DEFAULT 0 NOT NULL,
	`gross_minor` integer DEFAULT 0 NOT NULL,
	`fee_minor` integer DEFAULT 0 NOT NULL,
	`net_minor` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'qar' NOT NULL,
	`failure_code` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_reconciliation_client_request` ON `payment_reconciliation_runs` (`requested_by_user_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_reconciliation_status_created` ON `payment_reconciliation_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_reconciliation_window` ON `payment_reconciliation_runs` (`window_start`,`window_end`);
