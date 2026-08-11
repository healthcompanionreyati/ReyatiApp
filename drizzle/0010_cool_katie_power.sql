CREATE TABLE `payment_ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`amount_qar` integer NOT NULL,
	`currency` text DEFAULT 'QAR' NOT NULL,
	`status` text DEFAULT 'not_charged' NOT NULL,
	`provider_reference` text,
	`refund_amount_qar` integer,
	`status_updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CHECK (`amount_qar` >= 0),
	CHECK (`refund_amount_qar` IS NULL OR (`refund_amount_qar` >= 0 AND `refund_amount_qar` <= `amount_qar`)),
	CHECK (`currency` = 'QAR'),
	CHECK (`status` IN ('not_charged', 'authorized', 'paid', 'refund_pending', 'refunded', 'failed')),
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_ledger_appointment` ON `payment_ledger_entries` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_ledger_patient_status_updated` ON `payment_ledger_entries` (`patient_id`,`status`,`status_updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_ledger_provider_reference` ON `payment_ledger_entries` (`provider_reference`);
--> statement-breakpoint
PRAGMA optimize;
