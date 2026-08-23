CREATE TABLE `payment_checkout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_session_id` text NOT NULL,
	`provider_payment_intent_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `payment_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_checkout_provider_session` ON `payment_checkout_sessions` (`provider`,`provider_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_checkout_provider_intent` ON `payment_checkout_sessions` (`provider`,`provider_payment_intent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_checkout_client_request` ON `payment_checkout_sessions` (`created_by_user_id`,`ledger_entry_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_checkout_ledger_status_created` ON `payment_checkout_sessions` (`ledger_entry_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_processor_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`processing_status` text DEFAULT 'received' NOT NULL,
	`ledger_entry_id` text,
	`error_code` text,
	`received_at` integer NOT NULL,
	`processed_at` integer,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `payment_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_processor_provider_event` ON `payment_processor_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_processor_status_received` ON `payment_processor_events` (`processing_status`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_processor_ledger_received` ON `payment_processor_events` (`ledger_entry_id`,`received_at`);