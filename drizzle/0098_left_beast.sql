CREATE TABLE `payment_dispute_events` (
	`id` text PRIMARY KEY NOT NULL,
	`dispute_id` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`dispute_id`) REFERENCES `payment_disputes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_dispute_event_provider_id` ON `payment_dispute_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_dispute_event_dispute_received` ON `payment_dispute_events` (`dispute_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `payment_disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_entry_id` text,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_dispute_id` text NOT NULL,
	`provider_charge_id` text,
	`provider_payment_intent_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`reason_code` text NOT NULL,
	`status` text NOT NULL,
	`evidence_due_at` integer,
	`provider_created_at` integer NOT NULL,
	`provider_updated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `payment_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_dispute_provider_id` ON `payment_disputes` (`provider`,`provider_dispute_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_dispute_status_updated` ON `payment_disputes` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_dispute_ledger_updated` ON `payment_disputes` (`ledger_entry_id`,`updated_at`);