CREATE TABLE `encounter_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`history_text` text DEFAULT '' NOT NULL,
	`assessment_text` text DEFAULT '' NOT NULL,
	`plan_text` text DEFAULT '' NOT NULL,
	`patient_instructions` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`finalized_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_encounter_notes_appointment` ON `encounter_notes` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_encounter_notes_author_status` ON `encounter_notes` (`author_user_id`,`status`);
--> statement-breakpoint
CREATE TRIGGER `validate_encounter_finalization_on_insert`
BEFORE INSERT ON `encounter_notes`
WHEN NEW.`status` = 'finalized' AND NOT EXISTS (
	SELECT 1 FROM `appointments`
	WHERE `id` = NEW.`appointment_id`
		AND `status` IN ('confirmed', 'completed')
		AND `scheduled_start` <= CAST(unixepoch('now') AS INTEGER) * 1000
)
BEGIN
	SELECT RAISE(ABORT, 'appointment_not_eligible_for_finalization');
END;
--> statement-breakpoint
CREATE TRIGGER `validate_encounter_finalization_on_update`
BEFORE UPDATE OF `status` ON `encounter_notes`
WHEN NEW.`status` = 'finalized' AND OLD.`status` != 'finalized' AND NOT EXISTS (
	SELECT 1 FROM `appointments`
	WHERE `id` = NEW.`appointment_id`
		AND `status` IN ('confirmed', 'completed')
		AND `scheduled_start` <= CAST(unixepoch('now') AS INTEGER) * 1000
)
BEGIN
	SELECT RAISE(ABORT, 'appointment_not_eligible_for_finalization');
END;
--> statement-breakpoint
CREATE TRIGGER `complete_appointment_on_encounter_insert`
AFTER INSERT ON `encounter_notes`
WHEN NEW.`status` = 'finalized'
BEGIN
	UPDATE `appointments`
	SET `status` = 'completed', `version` = `version` + 1, `updated_at` = NEW.`updated_at`
	WHERE `id` = NEW.`appointment_id` AND `status` = 'confirmed';
END;
--> statement-breakpoint
CREATE TRIGGER `complete_appointment_on_encounter_update`
AFTER UPDATE OF `status` ON `encounter_notes`
WHEN NEW.`status` = 'finalized' AND OLD.`status` != 'finalized'
BEGIN
	UPDATE `appointments`
	SET `status` = 'completed', `version` = `version` + 1, `updated_at` = NEW.`updated_at`
	WHERE `id` = NEW.`appointment_id` AND `status` = 'confirmed';
END;
--> statement-breakpoint
PRAGMA optimize;
