CREATE TABLE `payment_credit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`credit_note_number` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_event_id` text NOT NULL,
	`provider_refund_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`reason_code` text DEFAULT 'provider_confirmed_refund' NOT NULL,
	`issued_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `payment_receipts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `payment_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_credit_note_number` ON `payment_credit_notes` (`credit_note_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_credit_note_provider_event` ON `payment_credit_notes` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_credit_note_receipt_issued` ON `payment_credit_notes` (`receipt_id`,`issued_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_credit_note_ledger_issued` ON `payment_credit_notes` (`ledger_entry_id`,`issued_at`);--> statement-breakpoint
CREATE TABLE `payment_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`receipt_number` text NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`provider_event_id` text NOT NULL,
	`provider_payment_intent_id` text,
	`provider_name` text NOT NULL,
	`facility_name` text,
	`appointment_started_at` integer NOT NULL,
	`care_mode` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`issued_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `payment_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_receipt_ledger` ON `payment_receipts` (`ledger_entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_receipt_number` ON `payment_receipts` (`receipt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_receipt_provider_event` ON `payment_receipts` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_receipt_issued` ON `payment_receipts` (`issued_at`);