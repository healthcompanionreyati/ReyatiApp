ALTER TABLE `appointments` ADD `cancelled_at` integer;
--> statement-breakpoint
CREATE TRIGGER `release_appointment_slot_locks_on_cancellation`
AFTER UPDATE OF `status` ON `appointments`
WHEN NEW.`status` IN ('cancelled', 'declined') AND OLD.`status` <> NEW.`status`
BEGIN
  DELETE FROM `appointment_slot_locks` WHERE `appointment_id` = NEW.`id`;
END;
