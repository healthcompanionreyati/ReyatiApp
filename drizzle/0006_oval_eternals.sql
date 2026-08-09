CREATE TABLE `platform_role_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`accepted_by_user_id` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_platform_role_invitations_token_hash` ON `platform_role_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_platform_role_invitations_email_status` ON `platform_role_invitations` (`email`,`status`);--> statement-breakpoint
CREATE INDEX `idx_platform_role_invitations_role_status` ON `platform_role_invitations` (`role`,`status`);
--> statement-breakpoint
CREATE TRIGGER `protect_final_platform_admin_update`
BEFORE UPDATE OF `status` ON `platform_roles`
WHEN OLD.`role` = 'platform_admin'
  AND OLD.`status` = 'active'
  AND NEW.`status` <> 'active'
  AND (SELECT COUNT(*) FROM `platform_roles` WHERE `role` = 'platform_admin' AND `status` = 'active') <= 1
BEGIN
  SELECT RAISE(ABORT, 'final active platform administrator cannot be suspended');
END;
--> statement-breakpoint
CREATE TRIGGER `protect_final_platform_admin_delete`
BEFORE DELETE ON `platform_roles`
WHEN OLD.`role` = 'platform_admin'
  AND OLD.`status` = 'active'
  AND (SELECT COUNT(*) FROM `platform_roles` WHERE `role` = 'platform_admin' AND `status` = 'active') <= 1
BEGIN
  SELECT RAISE(ABORT, 'final active platform administrator cannot be deleted');
END;
