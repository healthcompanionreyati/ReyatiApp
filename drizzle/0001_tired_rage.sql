CREATE TABLE `appointment_slot_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`slot_start` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_appointment_slot_locks_patient_slot` ON `appointment_slot_locks` (`patient_id`,`slot_start`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_appointment_slot_locks_provider_slot` ON `appointment_slot_locks` (`provider_id`,`slot_start`);--> statement-breakpoint
CREATE INDEX `idx_appointment_slot_locks_appointment` ON `appointment_slot_locks` (`appointment_id`);--> statement-breakpoint
ALTER TABLE `appointments` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_appointments_patient_idempotency` ON `appointments` (`patient_id`,`idempotency_key`);