CREATE TABLE `payment_refund_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`adjustment_id` text NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_refund_id` text,
	`provider_payment_intent_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'qar' NOT NULL,
	`status` text DEFAULT 'requesting' NOT NULL,
	`failure_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `payment_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_refund_adjustment` ON `payment_refund_executions` (`adjustment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_refund_provider_refund` ON `payment_refund_executions` (`provider`,`provider_refund_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_refund_client_request` ON `payment_refund_executions` (`requested_by_user_id`,`adjustment_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_refund_ledger_status_created` ON `payment_refund_executions` (`ledger_entry_id`,`status`,`created_at`);